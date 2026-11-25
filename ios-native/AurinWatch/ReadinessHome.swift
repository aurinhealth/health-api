import SwiftUI

/// The first page, the top of Today on the iPhone on the wrist (watch concept
/// 02, approved 2026-11-23): "Readiness", the number in the serif with the
/// pill of the usual range, the day's sentence, and Sleep, Strain and HRV as
/// the Today dials in one card. The number opens why readiness is what it is,
/// each dial its detail (the pages are in WatchRoot's navigationDestination);
/// the alarm sits at the top left, the coach's two lights at the top right.
/// The day's training has its own page one turn of the crown down.
///
/// Before today's numbers come (review 2026-11-02, point 6) it shows the last
/// day it has, greyed: "Getting today…" while the watch fetches them, "No
/// connection" only when that failed. Today without the night says "Waiting
/// for last night" with "–" for readiness, sleep and HRV (Today audit 20).
/// Always-On keeps only the number, the pill and the sentence, dimmed.
struct ReadinessHome: View {
    let s: WatchSnapshot
    /// Why `s` is not this morning's numbers; nil when it is.
    var stale: Stale? = nil
    @Environment(\.isLuminanceReduced) private var dimmed

    /// `s` is an older day's (greyed, its details closed).
    private var older: Bool { stale == .loading || stale == .failed }

    enum Page: Hashable {
        case why, sleep, restingHR, hrv, strain, alarm, coach
    }

    /// Whether a detail may open, from the dials and from a complication: an
    /// older day's would read as today's, and before last night comes HRV and
    /// resting HR would show the night before's (watch review 2026-11-25).
    static func canOpen(_ page: Page, _ s: WatchSnapshot, now: Date = WatchDemo.now) -> Bool {
        switch page {
        case .alarm, .coach: return true
        case .sleep, .strain: return s.date == WatchStore.localDate(now)
        case .why, .hrv, .restingHR: return s.date == WatchStore.localDate(now) && !s.awaitingNight
        }
    }

    enum Stale {
        /// The watch is getting today (from the iPhone or the server).
        case loading
        /// Neither the iPhone nor the server gave today.
        case failed
        /// Today came without last night (the wearable has not synced it yet).
        case night
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            heroLink
                // Under the corner buttons: the page sized to fit below them
                // (CI shot: "Readiness" sat under the alarm button, the page too tall).
                .padding(.top, 4)
            staleLine
            Spacer(minLength: 4)
            if !dimmed {
                dials.disabled(older)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .toolbar { corners }
        .containerBackground(background, for: .navigation)
        .containerBackground(background, for: .tabView)
    }

    private var heroLink: some View {
        NavigationLink(value: Page.why) { hero }
            .buttonStyle(.plain)
            // One element, not "78", "Readiness", "in your usual range" (watch audit G1).
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spokenTitle)
            .accessibilityValue(sentence ?? "")
            .accessibilityAddTraits(.isButton)
            // An older day's details would read as today's.
            .disabled(stale != nil)
    }

    private var spokenTitle: String {
        let number: String = s.readiness.map { String($0) } ?? "–"
        let word: String = pill.map { ", " + $0.text } ?? ""
        return title + " " + number + word
    }

    @ToolbarContentBuilder private var corners: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            NavigationLink(value: Page.alarm) {
                Image(systemName: "alarm").foregroundStyle(W.ink)
            }
            .accessibilityLabel(W.tr("Budík", "Alarm"))
        }
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink(value: Page.coach) { WatchCoachLights() }
                .accessibilityLabel(W.tr("Kouč, AI", "Coach, AI"))
        }
    }

    @ViewBuilder private var staleLine: some View {
        if stale == .failed {
            Text(W.tr("Bez spojení. Otevři Aurin v iPhonu a aktualizuj.", "No connection. Open Aurin on your iPhone to update."))
                .watchFont(12, .semibold)
                .foregroundStyle(W.amber)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
        } else if older {
            Text(dayLabel)
                .watchFont(12, .medium)
                .foregroundStyle(W.secondary)
                .padding(.top, 2)
        }
    }

    /// The page's green glow; plain black on Always-On.
    private var background: AnyShapeStyle {
        dimmed ? AnyShapeStyle(Color.black) : AnyShapeStyle(W.glow(W.Glow.readiness))
    }

    // MARK: Readiness

    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .watchFont(13, .medium)
                .foregroundStyle(W.muted)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 3)
            // The pill beside the number when it fits, under it when not
            // (a worse morning, Czech, a 42 mm watch, larger text).
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .bottom, spacing: 6) {
                    number(W.small ? 40 : 48)
                    pillView.padding(.bottom, 6)
                }
                VStack(alignment: .leading, spacing: 2) {
                    number(W.small ? 40 : 46)
                    pillView
                }
            }
            .padding(.top, 3)
            .padding(.leading, 1)
            if let sentence, stale == nil {
                Text(sentence)
                    .font(W.serif(W.small ? 14 : 15))
                    .foregroundStyle(dimmed ? W.secondary : W.num)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 3)
                    .padding(.horizontal, 3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func number(_ size: CGFloat) -> some View {
        if s.readiness == nil, let days = learning {
            // A new athlete: the day of the 14 readiness needs ("5/14"),
            // as "Learning your usual range" on the iPhone.
            HStack(alignment: .lastTextBaseline, spacing: 0) {
                Text(String(days)).foregroundStyle(W.num)
                Text(verbatim: "/14").foregroundStyle(W.muted)
            }
            .font(W.serif(size * 0.85))
            .lineLimit(1)
            .fixedSize()
        } else {
            Text(s.readiness.map { String($0) } ?? "–")
                .font(W.serif(size))
                .foregroundStyle(older ? W.muted : W.num)
                .lineLimit(1)
                .fixedSize()
        }
    }

    @ViewBuilder
    private var pillView: some View {
        if let pill {
            Text(pill.text)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(pill.color)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(dimmed ? Color.clear : pill.fill, in: Capsule())
                // Always-On: the outline only, no fill.
                .overlay { if dimmed { Capsule().stroke(pill.color, lineWidth: 1) } }
                .opacity(older ? 0.45 : 1)
        }
    }

    private var learning: Int? { s.learningDays.map { min(14, max(1, $0)) } }

    /// Above the number: what the page waits for, else "Readiness".
    private var title: String {
        return switch stale {
        case .loading: W.tr("Načítám dnešek…", "Getting today…")
        case .night: W.tr("Čekám na poslední noc", "Waiting for last night")
        case .failed, nil: W.tr("Připravenost", "Readiness")
        }
    }

    /// Whose numbers these are: "Yesterday", or the day's name when older.
    private var dayLabel: String {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date()).map(WatchStore.localDate)
        return s.date == yesterday ? W.tr("Včera", "Yesterday") : W.dayName(s.date).capitalized
    }

    /// The day's sentence under the number, the iPhone's verdict
    /// (ReadinessText.verdict, src/day-verdict.js): only this morning's, an
    /// older day's would read as advice for today.
    private var sentence: String? {
        guard s.readiness != nil else { return nil }
        return switch s.verdict {
        case "hard": W.tr("Dobrý den na tvrdý trénink", "Good day for a hard workout")
        case "steady": W.tr("Dnes s mírou", "Keep it steady today")
        case "easy": W.tr("Dnes v klidu", "Take it easy today")
        case "legs": W.tr("Dej nohám pauzu", "Give your legs a break")
        case "no_intensity": W.tr("Dnes bez intenzity", "No intensity today")
        case "rest": W.tr("Dnes odpočinek", "Rest today")
        default: nil
        }
    }

    /// The iPhone's pill (ReadinessText.pill): "in your usual range" in
    /// green, "below your usual range" grey (watch concept 02, point 4);
    /// while readiness learns a new athlete's normal, "learning".
    private var pill: (text: String, color: Color, fill: Color)? {
        if s.readiness == nil, learning != nil { return (W.tr("učím se", "learning"), W.amber, W.amber.opacity(0.14)) }
        guard s.readiness != nil else { return nil }
        switch s.zone {
        case "green": return (W.tr("v obvyklém rozmezí", "in your usual range"), W.green, W.green.opacity(0.14))
        case "yellow", "red": return (W.tr("pod obvyklým rozmezím", "below your usual range"), W.ink, Color.white.opacity(0.09))
        default: return nil
        }
    }

    // MARK: Sleep, strain, HRV

    private struct Dial {
        var page: Page
        var title: String
        var value: Double?
        var scale: ClosedRange<Double>
        var band: ClosedRange<Double>? = nil
        var dot: Color
        var number: String
        var unit: String? = nil
        /// What VoiceOver says after the title.
        var said: String
    }

    private var dials: some View {
        let size: CGFloat = W.small ? 34 : 40
        return HStack(spacing: 0) {
            ForEach(Array([sleep, strain, hrv].enumerated()), id: \.offset) { index, dial in
                if index > 0 { Rectangle().fill(W.hair).frame(width: 1) }
                NavigationLink(value: dial.page) {
                    VStack(spacing: 2) {
                        WatchDial(value: dial.value, scale: dial.scale, band: dial.band, dot: dial.dot,
                                  number: dial.number, unit: W.small && dial.page != .sleep ? nil : dial.unit, size: size)
                        Text(dial.title)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(W.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(dial.title)
                    .accessibilityValue(dial.said)
                }
                .buttonStyle(.plain)
                .disabled(!Self.canOpen(dial.page, s))
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 6)
        .padding(.bottom, 5)
        .padding(.horizontal, 4)
        // An older day's numbers, greyed (point 6).
        .saturation(older ? 0 : 1)
        .opacity(older ? 0.55 : 1)
        .background(W.card, in: RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.06), lineWidth: 1) }
    }

    /// The night against its need, as TodayDials: the band from the need to an
    /// hour over it, the dot green at the need, amber under it, red under
    /// three quarters of it.
    private var sleep: Dial {
        let title = W.tr("Spánek", "Sleep")
        guard let minutes = s.sleep?.minutes else {
            return Dial(page: .sleep, title: title, scale: 0...480, dot: W.ink, number: "–", said: "–")
        }
        var d = Dial(page: .sleep, title: title, value: minutes, scale: 0...max(540, minutes), dot: W.ink, number: W.clock(minutes: minutes),
                     unit: "h", said: W.spoken(seconds: minutes * 60))
        guard let need = s.sleep?.need, need > 0 else { return d }
        d.scale = 0...max(need * 1.3, minutes)
        d.band = need...(need + 60)
        d.dot = minutes >= need ? W.green : minutes >= need * 0.75 ? W.amber : W.red
        d.said += ", " + W.tr("z potřebných ", "of ") + W.spoken(seconds: need * 60) + W.tr("", " needed")
        return d
    }

    /// The day's strain on 0 to 21 against today's target, by the complications'
    /// rule (WatchSnapshot.Strain.standing): green within it, light under it
    /// before 18:00, amber over it or still under it from 18:00.
    private var strain: Dial {
        let score = s.strain.score
        let number = score.map { W.number($0, digits: 1) } ?? "–"
        var d = Dial(page: .strain, title: W.tr("Námaha", "Strain"), value: score, scale: 0...21, dot: W.ink, number: number,
                     unit: W.tr("z 21", "of 21"), said: score == nil ? "–" : number + W.tr(" z 21", " of 21"))
        guard let low = s.strain.low, let high = s.strain.high else { return d }
        d.band = low...max(low, high)
        if let score {
            switch WatchSnapshot.Strain.standing(score, low: low, high: high, at: WatchDemo.now) {
            case .onTarget: d.dot = W.green
            case .off: d.dot = W.amber
            case .neutral, nil: d.dot = W.ink
            }
        }
        d.said += ", " + W.tr("cíl ", "target ") + W.number(low) + W.tr(" až ", " to ") + W.number(high)
        return d
    }

    /// HRV against the usual range. Only this morning's: before the night
    /// comes the HRV is the night before's.
    private var hrv: Dial {
        let value = s.awaitingNight ? nil : s.hrv?.value
        var d = Dial(page: .hrv, title: "HRV", value: value, scale: 0...100, dot: W.ink, number: value.map { W.number($0) } ?? "–",
                     unit: "ms", said: value.map { W.number($0) + " ms" } ?? "–")
        guard let value, let low = s.hrv?.low, let high = s.hrv?.high, high > low else { return d }
        let pad = (high - low) * 1.2
        d.scale = max(0, min(low - pad, value - 5))...max(high + pad, value + 5)
        d.band = low...high
        // Light under the usual range (concept 02, the worse morning), green within or above it
        // (the complications' rule, WatchSnapshot.Metric.worse).
        d.dot = WatchSnapshot.Metric.worse(value, low: low, high: high, higherIsBetter: true) == true ? W.ink : W.green
        d.said += ", " + W.tr("obvykle ", "usual ") + W.number(low) + W.tr(" až ", " to ") + W.number(high)
        return d
    }
}
