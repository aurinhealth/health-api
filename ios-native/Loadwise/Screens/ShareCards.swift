import SwiftUI

// MARK: - The share image

/// One share image at any width (the preview, the thumbnails, the export):
/// everything is measured in hundredths of the width, like the mockups.
struct ShareCard: View {
    static let width: CGFloat = 360
    static let height: CGFloat = 640

    let kind: ShareKind
    let options: ShareOptions
    var day: ShareDay?
    var workout: ShareWorkout?
    var food: ShareFood?
    var week: ShareWeek?
    var milestones: ShareMilestones?
    var width: CGFloat = ShareCard.width
    /// The user's photo behind the numbers.
    var photo: UIImage? = nil
    /// Drawn over the live camera: no background of its own.
    var overCamera = false
    /// Where the user moved each block on a photo, in hundredths of the width.
    var offsets: [String: CGSize] = [:]

    /// The coordinate space the blocks report their frames in.
    static let space = "shareCard"

    private var onPhoto: Bool { photo != nil || overCamera }

    private var s: ShareStyle {
        ShareStyle(u: width / 100, t: ShareTheme(dark: options.dark, clear: options.clear || onPhoto), offsets: onPhoto ? offsets : [:])
    }

    var body: some View {
        let s = s
        let height = width * 16 / 9
        ZStack(alignment: .topLeading) {
            if onPhoto {
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFill().frame(width: width, height: height).clipped()
                }
                // Darker (lighter) at the top and the bottom, where the numbers usually are.
                let veil = options.dark ? Color.black : Color.white
                LinearGradient(stops: [.init(color: veil.opacity(0.4), location: 0), .init(color: veil.opacity(0), location: 0.28),
                                       .init(color: veil.opacity(0), location: 0.6), .init(color: veil.opacity(0.5), location: 1)],
                               startPoint: .top, endPoint: .bottom)
            } else {
                s.t.background(glow, width: width)
            }
            content(s)
                .frame(width: width, height: height, alignment: .topLeading)
                .shadow(color: s.t.clear ? (options.dark ? Color.black.opacity(0.45) : Color.white.opacity(0.7)) : .clear, radius: s.u * 1.4, y: s.u * 0.3)
        }
        .frame(width: width, height: height)
        .coordinateSpace(.named(Self.space))
        .clipped()
        .environment(\.colorScheme, options.dark ? .dark : .light)
    }

    private var glow: ShareTheme.Glow {
        switch (kind, options.variant) {
        case (.day, 0): return .indigo
        case (.day, 1): return .warm
        case (.day, _): return .green
        case (.activity, 2): return .rust
        case (.activity, _): return .warm
        case (.food, 1): return .indigo
        case (.food, 2): return .green
        case (.food, _): return .warm
        case (.week, 1): return .green
        case (.week, 0): return .warm
        case (.week, _): return .indigo
        case (.milestone, 2): return .warm
        case (.milestone, _): return .rust
        }
    }

    @ViewBuilder private func content(_ s: ShareStyle) -> some View {
        switch kind {
        case .day:
            if let day { ShareDayCard(day: day, options: options, s: s) }
        case .activity:
            if let workout { ShareActivityCard(workout: workout, options: options, s: s) }
        case .food:
            if let food { ShareFoodCard(food: food, options: options, s: s) }
        case .week:
            if let week { ShareWeekCard(week: week, options: options, s: s) }
        case .milestone:
            if let milestones { ShareMilestoneCard(milestones: milestones, options: options, s: s) }
        }
    }
}

/// Sizes in hundredths of the width and the image's colours.
struct ShareStyle {
    let u: CGFloat
    let t: ShareTheme
    /// The blocks moved on a photo, by id (ShareBlock), in hundredths of the width.
    var offsets: [String: CGSize] = [:]

    func serif(_ size: CGFloat) -> Font { .custom("InstrumentSerif-Regular", fixedSize: u * size) }
    func news(_ size: CGFloat) -> Font { .custom("Newsreader-Regular", fixedSize: u * size) }
    func italic(_ size: CGFloat) -> Font { .custom("Newsreader-Italic", fixedSize: u * size) }
    func sans(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font { .system(size: u * size, weight: weight) }

    /// The header: the mark and Aurin on the left, the date on the right.
    func brand(_ right: String) -> some View {
        HStack(spacing: u * 1.8) {
            AurinMark(size: u * 6.4)
            Text(verbatim: "Aurin").font(sans(4.6, .semibold)).kerning(u * 0.15).foregroundStyle(t.ink)
            Spacer(minLength: 0)
            Text(verbatim: right).font(sans(3.8)).foregroundStyle(t.muted)
        }
        .padding(.horizontal, u * 7)
        .padding(.top, u * 7)
    }

    /// A number in serif with its unit small after it.
    func value(_ value: String, _ unit: String = "", size: CGFloat, color: Color? = nil) -> Text {
        let number = Text(verbatim: value).font(serif(size)).foregroundColor(color ?? t.ink)
        guard !unit.isEmpty else { return number }
        return number + Text(verbatim: " " + L10n.tr(unit)).font(sans(3.5, .regular)).foregroundColor(t.muted)
    }

    func label(_ text: String, size: CGFloat = 4, color: Color? = nil) -> some View {
        Text(L10n.tr(text)).font(sans(size)).foregroundStyle(color ?? t.secondary).lineLimit(1)
    }

    /// A small label over a number.
    func number(_ label: String, _ value: String, _ unit: String = "", size: CGFloat = 8, color: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: u * 0.4) {
            Text(L10n.tr(label)).font(sans(3.4)).foregroundStyle(t.muted).lineLimit(1)
            self.value(value, unit, size: size, color: color).lineLimit(1).minimumScaleFactor(0.6)
        }
    }

    func pill(_ text: String, _ color: Color) -> some View {
        Text(L10n.tr(text)).font(sans(3.4, .semibold)).foregroundStyle(color)
            .padding(.horizontal, u * 2.6).padding(.vertical, u * 1)
            .background(color.opacity(0.16), in: Capsule())
    }

    func title(_ text: String, sub: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: u * 1) {
            Text(verbatim: text).font(news(10)).foregroundStyle(t.ink).lineLimit(2).minimumScaleFactor(0.6)
            if let sub { Text(verbatim: sub).font(sans(3.8)).foregroundStyle(t.muted) }
        }
        .padding(.horizontal, u * 7)
    }

    /// A progress bar with a glowing end.
    func bar(_ progress: Double, _ color: Color, height: CGFloat = 2.4) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(t.line(0.1))
                Capsule().fill(color)
                    .frame(width: max(u * height, geo.size.width * min(1, max(0, progress))))
                    .shadow(color: color.opacity(0.45), radius: u * 1.5)
            }
        }
        .frame(height: u * height)
    }

    /// A ring filled to `progress` with a text in the middle.
    func ring<Center: View>(_ progress: Double, _ color: Color, size: CGFloat, line: CGFloat, @ViewBuilder center: () -> Center) -> some View {
        ZStack {
            Circle().stroke(t.line(0.1), lineWidth: u * line)
            Circle().trim(from: 0, to: min(1, max(0.001, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: u * line, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: color.opacity(0.4), radius: u * line * 0.6)
            center()
        }
        .frame(width: u * size, height: u * size)
    }
}

/// The parts of an image the user can drag on a photo: the numbers at the
/// bottom and the big number or picture at the top.
enum ShareBlock {
    static let top = "top"
    static let bottom = "bottom"
}

/// Each movable block's frame where the layout put it, before its offset.
struct ShareBlockFrames: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { $1 }
    }
}

extension View {
    /// A block that moves on a photo: it reports its frame and takes its offset.
    func shareBlock(_ id: String, _ s: ShareStyle) -> some View {
        let offset = s.offsets[id] ?? .zero
        return background {
            GeometryReader { geo in
                Color.clear.preference(key: ShareBlockFrames.self, value: [id: geo.frame(in: .named(ShareCard.space))])
            }
        }
        .offset(x: offset.width * s.u, y: offset.height * s.u)
    }
}

/// A number with its label and unit.
struct ShareStat: Identifiable {
    let label: String
    let value: String
    let unit: String
    var id: String { label }
}

// MARK: - Den

/// A number of the day for Čísla, Velké and Dlaždice.
struct ShareMetric: Identifiable {
    enum Tone { case green, amber, indigo, rust, blue, ink }
    let key: String
    let label: String
    let value: String
    var unit = ""
    var sub: String?
    var tone: Tone = .ink
    var progress: Double?
    var id: String { key }

    func color(_ t: ShareTheme) -> Color {
        switch tone {
        case .green: return t.green
        case .amber: return t.amber
        case .indigo: return t.indigo
        case .rust: return t.rust
        case .blue: return t.blue
        case .ink: return t.ink
        }
    }
}

extension ShareDay {
    var readinessTone: ShareMetric.Tone {
        switch zone {
        case "yellow": return .amber
        case "red": return .rust
        default: return .green
        }
    }

    /// The numbers switched on, readiness first.
    func metrics(_ options: ShareOptions) -> [ShareMetric] {
        var out: [ShareMetric] = []
        if options.shows("Připravenost"), let readiness {
            out.append(ShareMetric(key: "Připravenost", label: "Připravenost", value: String(readiness), sub: readinessLabel,
                                   tone: readinessTone, progress: Double(readiness) / 100))
        }
        if options.shows("Spánek"), let sleepMinutes {
            let need = sleepNeed.map(Double.init)
            out.append(ShareMetric(key: "Spánek", label: "Spánek", value: Fmt.hoursMinutes(sleepMinutes),
                                   sub: need.map { L10n.f("%@ %% potřeby", Fmt.int(min(999, sleepMinutes / max(1, $0) * 100))) },
                                   tone: .indigo, progress: need.map { sleepMinutes / max(1, $0) }))
            if options.sleep.contains("HRV"), let hrv {
                out.append(ShareMetric(key: "HRV", label: "HRV", value: Fmt.int(hrv), unit: "ms", tone: .green))
            }
            if options.sleep.contains("Tep"), let restingHR {
                out.append(ShareMetric(key: "Tep", label: "Klidový tep", value: Fmt.int(restingHR), unit: "bpm", tone: .rust))
            }
        }
        if options.shows("Námaha"), let strain, strain > 0 {
            let target = strainLow.flatMap { low in strainHigh.map { L10n.f("cíl %@–%@", Fmt.int(low), Fmt.int($0)) } }
            out.append(ShareMetric(key: "Námaha", label: "Námaha", value: Fmt.decimal(strain), sub: target, tone: .amber,
                                   progress: strainHigh.map { strain / max(1, $0) }))
        }
        if options.shows("Kroky"), let steps, steps > 0 {
            out.append(ShareMetric(key: "Kroky", label: "Kroky", value: Fmt.int(steps),
                                   sub: stepsGoal.map { L10n.f("cíl %@", Fmt.int($0)) }, tone: .blue,
                                   progress: stepsGoal.map { steps / max(1, $0) }))
        }
        if options.shows("Trénink"), !workouts.isEmpty {
            let minutes = workouts.compactMap(\.minutes).reduce(0, +)
            if minutes > 0 {
                out.append(ShareMetric(key: "Trénink", label: "Trénink", value: Fmt.hoursMinutes(minutes), unit: "h",
                                       sub: workouts.count == 1 ? workouts[0].title : workouts.map { L10n.tr($0.sportName) }.joined(separator: " · "),
                                       tone: .amber))
            }
        }
        return out
    }
}

struct ShareDayCard: View {
    let day: ShareDay
    let options: ShareOptions
    let s: ShareStyle

    var body: some View {
        switch options.variant {
        case 1: numbers
        case 2: big
        case 3: tiles
        default: ShareTimeline(day: day, options: options, s: s)
        }
    }

    private var metrics: [ShareMetric] { day.metrics(options) }

    /// B: the first number big, the others as rows with their bars.
    private var numbers: some View {
        let list = metrics
        let u = s.u
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(day.date))
            if let hero = list.first {
                VStack(alignment: .leading, spacing: u * 1) {
                    s.label(hero.label, size: 4.2)
                    HStack(alignment: .lastTextBaseline, spacing: u * 3) {
                        s.value(hero.value, hero.unit, size: 30, color: hero.tone == .ink ? nil : hero.color(s.t))
                            .lineLimit(1).minimumScaleFactor(0.5)
                        if let sub = hero.sub { s.pill(sub, hero.color(s.t)) }
                    }
                }
                .shareBlock(ShareBlock.top, s)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 26)
            }
            VStack(spacing: 0) {
                ForEach(Array(list.dropFirst().prefix(4).enumerated()), id: \.element.id) { i, m in
                    VStack(alignment: .leading, spacing: u * 2) {
                        HStack(alignment: .firstTextBaseline) {
                            s.label(m.label)
                            Spacer(minLength: u * 2)
                            s.value(m.value, m.unit, size: 7.4).lineLimit(1)
                        }
                        if let p = m.progress { s.bar(p, m.color(s.t), height: 1.6) }
                    }
                    .padding(.vertical, u * 3.2)
                    .overlay(alignment: .top) { if i > 0 { Rectangle().fill(s.t.line(0.08)).frame(height: 1) } }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// C: one ring for the first number, three more under it.
    private var big: some View {
        let list = metrics
        let u = s.u
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(day.date))
            if let hero = list.first {
                VStack(spacing: u * 3) {
                    s.ring(hero.progress ?? 1, hero.color(s.t), size: 78, line: 3.2) {
                        s.value(hero.value, "", size: hero.value.count > 4 ? 20 : 30).lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, u * 8)
                    }
                    s.label(hero.label, size: 4.6).padding(.top, u * 2)
                    if let sub = hero.sub { s.pill(sub, hero.color(s.t)) }
                }
                .shareBlock(ShareBlock.top, s)
                .frame(maxWidth: .infinity)
                .padding(.top, u * 24)
            }
            VStack {
                HStack(alignment: .top) {
                    ForEach(Array(list.dropFirst().prefix(3).enumerated()), id: \.element.id) { i, m in
                        if i > 0 { Spacer(minLength: u * 2) }
                        s.number(m.label, m.value, m.unit, size: 7.4)
                    }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// D: tiles, the first one across; with three numbers or fewer, all across.
    private var tiles: some View {
        let list = metrics
        let u = s.u
        let wide = list.count <= 3
        var rows: [[ShareMetric]] = []
        if wide {
            rows = list.map { [$0] }
        } else if let first = list.first {
            rows = [[first]]
            var rest = Array(list.dropFirst())
            while !rest.isEmpty { rows.append(Array(rest.prefix(2))); rest = Array(rest.dropFirst(2)) }
        }
        let wideSizes: [Int: CGFloat] = [1: 34, 2: 30, 3: 24]
        let gridSizes: [Int: CGFloat] = [3: 16, 4: 13]
        let size: CGFloat = wide ? (wideSizes[rows.count] ?? 24) : (gridSizes[rows.count] ?? 11)
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(ShareText.date(day.date))
            VStack(spacing: u * 2.6) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                    HStack(spacing: u * 2.6) {
                        ForEach(row) { m in
                            tile(m, size: r == 0 ? (wide ? size * 1.15 : size * 1.5) : size, hero: r == 0)
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
            }
            .padding(.horizontal, u * 6)
            .padding(.top, u * 7)
            .padding(.bottom, u * 6)
        }
    }

    private func tile(_ m: ShareMetric, size: CGFloat, hero: Bool) -> some View {
        let u = s.u
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: u * 1.6) {
                Circle().fill(m.color(s.t)).frame(width: u * 2, height: u * 2)
                s.label(m.label, size: 3.7)
            }
            Spacer(minLength: u * 1)
            s.value(m.value, m.unit, size: size, color: hero ? m.color(s.t) : nil).lineLimit(1).minimumScaleFactor(0.4)
            if let sub = m.sub {
                Text(L10n.tr(sub)).font(s.sans(3.2)).foregroundStyle(s.t.muted).lineLimit(1).padding(.top, u * 1)
            }
        }
        .padding(.horizontal, u * 4.4).padding(.vertical, u * 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(s.t.line(s.t.clear ? 0.1 : 0.05), in: RoundedRectangle(cornerRadius: u * 4.5, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: u * 4.5, style: .continuous).stroke(s.t.line(0.07), lineWidth: 1))
    }
}

// MARK: - Den A: the timeline

/// The day on one line: the night and workouts from start to end, readiness,
/// strain and steps as dots, each at its real time.
struct ShareTimeline: View {
    let day: ShareDay
    let options: ShareOptions
    let s: ShareStyle

    private enum Event: Identifiable {
        case sleep, readiness, workout(Int), strain, steps
        var id: String {
            switch self {
            case .sleep: return "sleep"
            case .readiness: return "readiness"
            case .workout(let i): return "workout\(i)"
            case .strain: return "strain"
            case .steps: return "steps"
            }
        }
    }

    private struct Timed: Identifiable {
        let at: Int
        let event: Event
        var id: String { event.id }
    }

    /// What is switched on and has a value, in the order it happened.
    private var events: [Timed] {
        var out: [Timed] = []
        let wake = ShareDay.minutes(day.sleepEnd) ?? 0
        if options.shows("Spánek"), day.sleepMinutes != nil { out.append(Timed(at: wake, event: .sleep)) }
        if options.shows("Připravenost"), day.readiness != nil { out.append(Timed(at: wake + 1, event: .readiness)) }
        let now = ShareDay.minutes(day.stepsTime) ?? 1440
        var lastEnd: Int?
        for (i, w) in day.workouts.enumerated() {
            let at = ShareDay.minutes(w.end) ?? ShareDay.minutes(w.start) ?? 720
            lastEnd = max(lastEnd ?? 0, at)
            if options.shows("Trénink") { out.append(Timed(at: at, event: .workout(i))) }
        }
        if options.shows("Námaha"), let strain = day.strain, strain > 0 {
            out.append(Timed(at: (lastEnd ?? now) + 1, event: .strain))
        }
        if options.shows("Kroky"), let steps = day.steps, steps > 0 { out.append(Timed(at: now + 2, event: .steps)) }
        return out.sorted { $0.at < $1.at }
    }

    private var timeWidth: CGFloat { s.u * 11 }
    private var lineWidth: CGFloat { s.u * 7 }
    private var gap: CGFloat { s.u * 2.4 }

    var body: some View {
        let list = events
        let u = s.u
        VStack(alignment: .leading, spacing: 0) {
            s.brand(ShareText.date(day.date))
            ZStack(alignment: .topLeading) {
                LinearGradient(colors: [s.t.line(0.22), s.t.line(0.22), s.t.line(0)], startPoint: .top, endPoint: .bottom)
                    .frame(width: u * 0.5)
                    .padding(.top, u * 1).padding(.bottom, -u * 4)
                    .offset(x: timeWidth + gap + lineWidth / 2 - u * 0.25)
                    .opacity(list.isEmpty ? 0 : 1)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, item in
                        if i > 0 { Spacer(minLength: u * 2) }
                        row(item.event)
                    }
                }
            }
            .padding(.leading, u * 4).padding(.trailing, u * 6)
            .padding(.top, u * 9)
            .padding(.bottom, u * (list.count > 3 ? 12 : 30))
        }
    }

    @ViewBuilder private func row(_ event: Event) -> some View {
        switch event {
        case .sleep: sleepRow
        case .readiness: readinessRow
        case .workout(let i): workoutRow(day.workouts[i])
        case .strain: strainRow
        case .steps: stepsRow
        }
    }

    // Rows

    private var sleepRow: some View {
        let u = s.u
        let chips = ShareDay.sleepStats.filter { options.sleep.contains($0) }.compactMap { stat -> ShareStat? in
            switch stat {
            case "HRV": return day.hrv.map { ShareStat(label: "HRV", value: Fmt.int($0), unit: "ms") }
            case "Tep": return day.restingHR.map { ShareStat(label: "Tep", value: Fmt.int($0), unit: "bpm") }
            case "Hluboký": return day.deepMinutes.map { ShareStat(label: "Hluboký", value: Fmt.hoursMinutes($0), unit: "h") }
            case "REM": return day.remMinutes.map { ShareStat(label: "REM", value: Fmt.hoursMinutes($0), unit: "h") }
            case "Skóre": return day.sleepScore.map { ShareStat(label: "Skóre", value: String($0), unit: "") }
            default: return nil
            }
        }
        return span(s.t.indigo, ShareText.clock(day.sleepStart), ShareText.clock(day.sleepEnd), height: 26) {
            s.label("Spánek")
            s.value(Fmt.hoursMinutes(day.sleepMinutes), size: 9)
            if !chips.isEmpty {
                FlowLayout(spacing: u * 1.6) {
                    ForEach(chips) { chip($0.label, $0.value, $0.unit) }
                }
                .padding(.top, u * 2)
            }
        }
    }

    private var readinessRow: some View {
        let u = s.u
        let color = ShareMetric(key: "", label: "", value: "", tone: day.readinessTone).color(s.t)
        return point(color, ShareText.clock(day.sleepEnd)) {
            HStack(spacing: u * 2.4) {
                s.label("Připravenost")
                s.value(day.readiness.map { String($0) } ?? "–", size: 8, color: color)
                if let label = day.readinessLabel { s.pill(label, color) }
            }
        }
    }

    private func workoutRow(_ w: ShareWorkout) -> some View {
        let u = s.u
        let stats = ShareDay.workoutStats.filter { options.workout.contains($0) }.compactMap { w.stat($0) }
        let compact = day.workouts.count > 1
        return span(s.t.amber, ShareText.clock(w.start), ShareText.clock(w.end), height: stats.isEmpty ? 14 : (compact ? 20 : 30)) {
            s.label(w.title)
            if !stats.isEmpty {
                if compact {
                    HStack(spacing: u * 4) {
                        ForEach(Array(stats.prefix(3))) { s.number($0.label, $0.value, $0.unit, size: 6) }
                    }
                    .padding(.top, u * 1.6)
                } else {
                    Grid(alignment: .leading, horizontalSpacing: u * 3, verticalSpacing: u * 1.6) {
                        ForEach(Array(stride(from: 0, to: stats.count, by: 2)), id: \.self) { i in
                            GridRow {
                                s.number(stats[i].label, stats[i].value, stats[i].unit, size: 6.4)
                                if i + 1 < stats.count { s.number(stats[i + 1].label, stats[i + 1].value, stats[i + 1].unit, size: 6.4) }
                            }
                        }
                    }
                    .padding(.top, u * 2)
                }
            }
        }
    }

    private var strainRow: some View {
        let last = day.workouts.compactMap(\.end).last
        return point(s.t.rust, ShareText.clock(last ?? day.stepsTime)) {
            HStack(alignment: .firstTextBaseline, spacing: s.u * 2.4) {
                s.label("Námaha")
                s.value(Fmt.decimal(day.strain), size: 8)
            }
        }
    }

    private var stepsRow: some View {
        let steps = Int((day.steps ?? 0).rounded())
        return point(s.t.blue, ShareText.clock(day.stepsTime)) {
            HStack(alignment: .firstTextBaseline, spacing: s.u * 2) {
                s.value(Fmt.int(day.steps), size: 8)
                Text(L10n.tr(Fmt.plural(steps, "krok", "kroky", "kroků"))).font(s.sans(3.8)).foregroundStyle(s.t.secondary)
            }
        }
    }

    // Pieces

    private func chip(_ label: String, _ value: String, _ unit: String) -> some View {
        let u = s.u
        return HStack(alignment: .firstTextBaseline, spacing: u * 1.2) {
            Text(L10n.tr(label)).font(s.sans(3.1)).foregroundStyle(s.t.muted)
            Text(verbatim: value).font(s.serif(5)).foregroundStyle(s.t.ink)
            if !unit.isEmpty { Text(verbatim: unit).font(s.sans(2.9, .regular)).foregroundStyle(s.t.muted) }
        }
        .padding(.horizontal, u * 2.4).padding(.vertical, u * 0.8)
        .background(s.t.line(0.07), in: Capsule())
    }

    private func dot(_ color: Color) -> some View {
        let u = s.u
        return Circle()
            .strokeBorder(color, lineWidth: u * 1.1)
            .background(Circle().fill(s.t.hole))
            .frame(width: u * 3.6, height: u * 3.6)
            .shadow(color: color.opacity(0.55), radius: u * 1.2)
    }

    private func times(_ texts: [String], spread: Bool) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            ForEach(Array(texts.enumerated()), id: \.offset) { i, text in
                if i > 0 && spread { Spacer(minLength: 0) }
                Text(verbatim: text).font(s.sans(3.3)).foregroundStyle(s.t.muted).lineLimit(1).minimumScaleFactor(0.6)
            }
        }
        .frame(width: timeWidth, alignment: .trailing)
    }

    /// A row from start to end: both times, a bar between two dots.
    private func span<Content: View>(_ color: Color, _ start: String, _ end: String, height: CGFloat, @ViewBuilder content: () -> Content) -> some View {
        let u = s.u
        return HStack(alignment: .top, spacing: gap) {
            times([start, end], spread: true)
            ZStack {
                Capsule()
                    .fill(LinearGradient(colors: [color, color.opacity(0.67)], startPoint: .top, endPoint: .bottom))
                    .frame(width: u * 1.3)
                    .padding(.vertical, u * 1.8)
                    .shadow(color: color.opacity(0.4), radius: u * 1.5)
                VStack(spacing: 0) {
                    dot(color)
                    Spacer(minLength: 0)
                    dot(color)
                }
            }
            .frame(width: lineWidth)
            VStack(alignment: .leading, spacing: 0) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, -u * 0.6)
        }
        .frame(minHeight: u * height)
        .fixedSize(horizontal: false, vertical: true)
    }

    /// A moment: its time and a dot.
    private func point<Content: View>(_ color: Color, _ time: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .center, spacing: gap) {
            times([time], spread: false)
            dot(color).frame(width: lineWidth)
            content().frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Aktivita

struct ShareActivityCard: View {
    let workout: ShareWorkout
    let options: ShareOptions
    let s: ShareStyle

    /// The stats switched on that this workout has.
    private var stats: [ShareStat] {
        ShareWorkout.stats.filter { options.shows($0) }.compactMap { workout.stat($0) }
    }

    var body: some View {
        switch options.variant {
        case 1 where !workout.isGym || workout.curve.count >= 2: graph
        case 1, 2: numbers
        default:
            if workout.isGym { exercises } else { route }
        }
    }

    /// The sport's icon and the workout's name.
    private var sportTitle: some View {
        let u = s.u
        return HStack(spacing: u * 3) {
            Image(systemName: workout.symbol).font(.system(size: u * 5.4, weight: .semibold)).foregroundStyle(s.t.amber)
                .frame(width: u * 11, height: u * 11)
                .background(s.t.amber.opacity(0.18), in: Circle())
            Text(verbatim: workout.title).font(s.news(8.4)).foregroundStyle(s.t.ink).lineLimit(2).minimumScaleFactor(0.6)
        }
    }

    /// Gym A: each exercise's best set, three numbers under them.
    private var exercises: some View {
        let u = s.u
        let list = Array(stats.filter { $0.label != "Cviky" }.prefix(3))
        let rows = Array(workout.best.prefix(list.isEmpty ? 8 : 6))
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(dateText))
            VStack(alignment: .leading, spacing: 0) {
                sportTitle
                if !rows.isEmpty {
                    Text(L10n.tr("Nejlepší série").uppercased()).font(s.sans(3.4)).kerning(u * 0.3).foregroundStyle(s.t.muted)
                        .padding(.top, u * 9)
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, best in
                            HStack(alignment: .firstTextBaseline, spacing: u * 3) {
                                Text(verbatim: best.name).font(s.sans(4.2)).foregroundStyle(s.t.secondary).lineLimit(1)
                                Spacer(minLength: u * 2)
                                Text(verbatim: best.set).font(s.serif(6.2)).foregroundStyle(s.t.ink).lineLimit(1)
                            }
                            .padding(.vertical, u * 2.4)
                            .overlay(alignment: .top) { if i > 0 { Rectangle().fill(s.t.line(0.08)).frame(height: 1) } }
                        }
                    }
                    .padding(.top, u * 1.6)
                }
            }
            .shareBlock(ShareBlock.top, s)
            .padding(.horizontal, u * 7)
            .padding(.top, u * 19)
            HStack(alignment: .top) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, stat in
                    if i > 0 { Spacer(minLength: u * 2) }
                    s.number(stat.label, stat.value, stat.unit, size: 10)
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// A: the route (the curve without one) with the numbers under it.
    private var route: some View {
        let u = s.u
        let list = Array(stats.prefix(4))
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(dateText))
            Group {
                if workout.route.count >= 2 {
                    ShareRoute(points: workout.route, color: s.t.amber, start: s.t.green, end: s.t.rust, hole: s.t.hole, u: u)
                        .frame(width: u * 86, height: u * 93)
                } else if workout.curve.count >= 2 {
                    ShareCurve(values: workout.curve, color: s.t.amber, u: u).frame(width: u * 86, height: u * 50)
                        .padding(.top, u * 30)
                }
            }
            .shareBlock(ShareBlock.top, s)
            .frame(maxWidth: .infinity)
            .padding(.top, u * 20)
            VStack(alignment: .leading, spacing: u * 4) {
                Text(verbatim: workout.title).font(s.news(9)).foregroundStyle(s.t.ink).lineLimit(2).minimumScaleFactor(0.6)
                HStack(spacing: u * (list.count < 3 ? 12 : 6)) {
                    ForEach(list) { s.number($0.label, $0.value, $0.unit, size: list.count < 3 ? 11 : 8) }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// B: the power (or heart rate) through the workout and its zones.
    private var graph: some View {
        let u = s.u
        let sub = [workout.value("Vzdálenost").map { $0.value + " " + $0.unit }, workout.value("Čas").map { $0.value + " h" }]
            .compactMap { $0 }.joined(separator: " · ")
        let zoneColors = [s.t.zoneGrey, s.t.blue, s.t.green, s.t.amber, s.t.rust, s.t.indigo]
        let list = Array(stats.prefix(3))
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(dateText))
            VStack(alignment: .leading, spacing: 0) {
                s.title(workout.title, sub: sub.isEmpty ? nil : sub)
                if workout.curve.count >= 2 {
                    VStack(alignment: .leading, spacing: u * 2) {
                        Text(L10n.tr(workout.curveIsPower ? "Výkon" : "Tep")).font(s.sans(3.4)).foregroundStyle(s.t.muted)
                        ShareCurve(values: workout.curve, color: s.t.amber, u: u).frame(height: u * 36)
                        if !workout.zones.isEmpty {
                            let total = max(1, workout.zones.reduce(0, +))
                            HStack(spacing: 0) {
                                ForEach(Array(workout.zones.enumerated()), id: \.offset) { i, p in
                                    zoneColors[min(i, zoneColors.count - 1)]
                                        .frame(width: max(0, u * 86 * p / total - u * 0.6))
                                        .padding(.trailing, u * 0.6)
                                }
                            }
                            .frame(width: u * 86, height: u * 2.4, alignment: .leading)
                            .clipShape(Capsule())
                            .padding(.top, u * 5)
                        }
                    }
                    .padding(.horizontal, u * 7)
                    .padding(.top, u * 10)
                }
            }
            .shareBlock(ShareBlock.top, s)
            .padding(.top, u * 21)
            VStack {
                HStack(alignment: .top) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, stat in
                        if i > 0 { Spacer(minLength: u * 2) }
                        s.number(stat.label, stat.value, stat.unit, size: 8)
                    }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// C: the sport and the numbers set big, one under another.
    private var numbers: some View {
        let u = s.u
        let list = Array(stats.prefix(4))
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(dateText))
            sportTitle
                .shareBlock(ShareBlock.top, s)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 19)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, stat in
                    s.number(stat.label, stat.value, stat.unit, size: list.count > 3 ? 15 : 18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, u * 3.2)
                        .overlay(alignment: .top) { if i > 0 { Rectangle().fill(s.t.line(0.08)).frame(height: 1) } }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 7)
        }
    }

    private var dateText: String { workout.date ?? "" }
}

/// A route fitted into its frame, glowing, with a start and an end dot.
struct ShareRoute: View {
    let points: [[Double]]
    let color: Color
    let start: Color
    let end: Color
    let hole: Color
    let u: CGFloat

    var body: some View {
        GeometryReader { geo in
            let path = Self.path(points, in: geo.size.insetBy(u * 4))
            ZStack(alignment: .topLeading) {
                path.line.stroke(color.opacity(0.14), style: StrokeStyle(lineWidth: u * 4.4, lineCap: .round, lineJoin: .round))
                path.line.stroke(color, style: StrokeStyle(lineWidth: u * 1.6, lineCap: .round, lineJoin: .round))
                    .shadow(color: color.opacity(0.6), radius: u * 1.6)
                marker(start).position(path.first)
                marker(end).position(path.last)
            }
            .offset(x: u * 4, y: u * 4)
        }
    }

    private func marker(_ c: Color) -> some View {
        Circle().strokeBorder(c, lineWidth: u * 1.2).background(Circle().fill(hole)).frame(width: u * 4.4, height: u * 4.4)
    }

    /// Longitude scaled by the latitude, so the shape keeps its proportions.
    static func path(_ points: [[Double]], in size: CGSize) -> (line: Path, first: CGPoint, last: CGPoint) {
        let step = max(1, points.count / 400)
        let picked: [[Double]] = stride(from: 0, to: points.count, by: step).map { points[$0] } + [points[points.count - 1]]
        let lat0: Double = picked.map { $0[0] }.reduce(0, +) / Double(picked.count)
        let k: Double = cos(lat0 * .pi / 180)
        let xs: [Double] = picked.map { $0[1] * k }
        let ys: [Double] = picked.map { -$0[0] }
        let width = Double(size.width), height = Double(size.height)
        let minX = xs.min() ?? 0, maxX = xs.max() ?? 1, minY = ys.min() ?? 0, maxY = ys.max() ?? 1
        let scale: Double = min(width / max(1e-9, maxX - minX), height / max(1e-9, maxY - minY))
        let dx: Double = (width - (maxX - minX) * scale) / 2
        let dy: Double = (height - (maxY - minY) * scale) / 2
        let pts: [CGPoint] = zip(xs, ys).map { x, y in CGPoint(x: dx + (x - minX) * scale, y: dy + (y - minY) * scale) }
        var line = Path()
        line.addLines(pts)
        return (line, pts.first ?? .zero, pts.last ?? .zero)
    }
}

private extension CGSize {
    func insetBy(_ d: CGFloat) -> CGSize { CGSize(width: max(1, width - 2 * d), height: max(1, height - 2 * d)) }
}

/// A stream as a line with a soft area under it.
struct ShareCurve: View {
    let values: [Double]
    let color: Color
    let u: CGFloat

    static func points(_ values: [Double], in size: CGSize) -> [CGPoint] {
        let w = Double(size.width), h = Double(size.height)
        let top: Double = max(1, values.max() ?? 1)
        let bottom: Double = min(top * 0.9, (values.min() ?? 0) * 0.85)
        let last = Double(max(1, values.count - 1))
        return values.enumerated().map { item -> CGPoint in
            let x: Double = w * Double(item.offset) / last
            let y: Double = h - h * (item.element - bottom) / max(1, top - bottom)
            return CGPoint(x: x, y: y)
        }
    }

    var body: some View {
        GeometryReader { geo in
            let pts = Self.points(values, in: geo.size)
            let w = geo.size.width, h = geo.size.height
            let line = Path { $0.addLines(pts) }
            let area = Path { p in
                p.addLines(pts)
                p.addLine(to: CGPoint(x: w, y: h))
                p.addLine(to: CGPoint(x: 0, y: h))
                p.closeSubpath()
            }
            ZStack {
                area.fill(LinearGradient(colors: [color.opacity(0.55), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                line.stroke(color, style: StrokeStyle(lineWidth: u * 0.9, lineJoin: .round))
            }
        }
    }
}

// MARK: - Jídlo

struct ShareFoodCard: View {
    let food: ShareFood
    let options: ShareOptions
    let s: ShareStyle

    private struct Part: Identifiable {
        let key: String
        let value: Double
        let target: Double?
        let unit: String
        let color: Color
        var id: String { key }
        var progress: Double { target.map { value / max(1, $0) } ?? 0 }
    }

    private struct Arc: Identifiable {
        let part: Part
        let from: Double
        let to: Double
        var id: String { part.key }
    }

    /// Bílkoviny, Sacharidy, Tuky and Voda switched on, with what was eaten.
    private var parts: [Part] {
        var out: [Part] = []
        let add = { (key: String, m: TodaySnapshot.Macro, color: Color) in
            if options.shows(key), let eaten = m.eaten { out.append(Part(key: key, value: eaten, target: m.target, unit: "g", color: color)) }
        }
        add("Bílkoviny", food.protein, s.t.protein)
        add("Sacharidy", food.carbs, s.t.carbs)
        add("Tuky", food.fat, s.t.fat)
        if options.shows("Voda"), let ml = food.waterMl, ml > 0 {
            out.append(Part(key: "Voda", value: ml, target: food.waterTarget, unit: "ml", color: s.t.blue))
        }
        return out
    }

    private var showsEnergy: Bool { options.shows("Energie") && food.kcal != nil }

    private func amount(_ p: Part) -> (String, String) { amount(p.key, p.value) }

    /// Grams, and water in litres (fluid ounces in imperial).
    private func amount(_ key: String, _ value: Double) -> (String, String) {
        if key == "Voda" {
            return Units.imperial ? (Fmt.decimal(Units.volume(value), digits: 0), "fl oz") : (Fmt.decimal(value / 1000, digits: 1), "l")
        }
        return (Fmt.int(value), "g")
    }

    var body: some View {
        switch options.variant {
        case 1: split
        case 2: dial
        default: macros
        }
    }

    /// A: energy against the target, each nutrient as a bar.
    private var macros: some View {
        let u = s.u
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(food.date))
            if showsEnergy {
                VStack(alignment: .leading, spacing: u * 1) {
                    s.label("Energie", size: 4.2)
                    (Text(verbatim: Fmt.int(food.kcal)).font(s.serif(24)).foregroundColor(s.t.ink)
                     + Text(verbatim: food.kcalTarget.map { " / " + Fmt.int($0) + " kcal" } ?? " kcal").font(s.sans(4.4, .regular)).foregroundColor(s.t.muted))
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
                .shareBlock(ShareBlock.top, s)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 24)
            }
            VStack(alignment: .leading, spacing: u * 6) {
                ForEach(parts) { p in
                    let a = amount(p)
                    VStack(alignment: .leading, spacing: u * 1.6) {
                        HStack(alignment: .firstTextBaseline) {
                            s.label(p.key, size: 4.2)
                            Spacer(minLength: u * 2)
                            (Text(verbatim: a.0).font(s.serif(8)).foregroundColor(s.t.ink)
                             + Text(verbatim: (p.target.map { " / " + amount(p.key, $0).0 } ?? "") + " " + a.1)
                                .font(s.sans(3.6, .regular)).foregroundColor(s.t.muted))
                                .lineLimit(1)
                        }
                        s.bar(p.progress, p.color)
                    }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 10)
        }
    }

    /// B: where the energy came from, one ring split by the macros.
    private var split: some View {
        let u = s.u
        let kcal = parts.filter { $0.key != "Voda" }.map { p -> (Part, Double) in (p, p.value * (p.key == "Tuky" ? 9 : 4)) }
        let total = max(1, kcal.reduce(0) { $0 + $1.1 })
        let size: CGFloat = 66, line: CGFloat = 6
        var arcs: [Arc] = []
        var start = 0.0
        for item in kcal {
            arcs.append(Arc(part: item.0, from: start, to: start + item.1 / total))
            start += item.1 / total
        }
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(food.date))
            ZStack {
                Circle().stroke(s.t.line(0.06), lineWidth: u * line)
                ForEach(arcs) { arc in
                    let gap = arcs.count > 1 ? 0.035 : 0
                    Circle().trim(from: arc.from + gap / 2, to: max(arc.from + gap / 2 + 0.001, arc.to - gap / 2))
                        .stroke(arc.part.color, style: StrokeStyle(lineWidth: u * line, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                VStack(spacing: u * 1) {
                    Text(verbatim: showsEnergy ? Fmt.int(food.kcal) : Fmt.int(total)).font(s.serif(13)).foregroundStyle(s.t.ink)
                    Text(verbatim: "kcal").font(s.sans(3.8)).foregroundStyle(s.t.muted)
                }
            }
            .frame(width: u * size, height: u * size)
            .shareBlock(ShareBlock.top, s)
            .frame(maxWidth: .infinity)
            .padding(.top, u * 24)
            VStack {
                HStack(alignment: .top) {
                    ForEach(Array(arcs.enumerated()), id: \.element.id) { i, arc in
                        if i > 0 { Spacer(minLength: u * 2) }
                        VStack(spacing: u * 0.6) {
                            Text(verbatim: Fmt.int((arc.to - arc.from) * 100) + " %").font(s.serif(9)).foregroundStyle(arc.part.color)
                            Text(L10n.tr(arc.part.key)).font(s.sans(3.4)).foregroundStyle(s.t.muted)
                        }
                    }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 12)
        }
    }

    /// C: energy as a half dial, each nutrient as a column filling up.
    private var dial: some View {
        let u = s.u
        let p = food.kcalTarget.map { (food.kcal ?? 0) / max(1, $0) } ?? 1
        let list = parts
        let height: CGFloat = showsEnergy ? 46 : 66
        let column: CGFloat = list.count > 3 ? 7 : 9
        return ZStack(alignment: .topLeading) {
            s.brand(ShareText.date(food.date))
            if showsEnergy {
                ShareDial(progress: p, color: s.t.green, track: s.t.line(0.08), tick: s.t.line(0.22), hole: s.t.hole, u: u) {
                    VStack(spacing: u * 1) {
                        Text(verbatim: Fmt.int(food.kcal)).font(s.serif(19)).foregroundStyle(s.t.ink)
                        if let target = food.kcalTarget {
                            Text(verbatim: L10n.f("z %@ kcal", Fmt.int(target))).font(s.sans(3.8)).foregroundStyle(s.t.muted)
                        }
                    }
                }
                .frame(width: u * 78, height: u * 43)
                .shareBlock(ShareBlock.top, s)
                .frame(maxWidth: .infinity)
                .padding(.top, u * 22)
            }
            VStack {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(list) { part in
                        let a = amount(part)
                        VStack(spacing: u * 2) {
                            ZStack(alignment: .bottom) {
                                Capsule().fill(s.t.line(0.07))
                                Capsule()
                                    .fill(LinearGradient(colors: [part.color, part.color.opacity(0.55)], startPoint: .top, endPoint: .bottom))
                                    .frame(height: u * height * min(1, max(0.04, part.progress)))
                                    .shadow(color: part.color.opacity(0.4), radius: u * 2)
                            }
                            .frame(width: u * column, height: u * height)
                            .clipShape(Capsule())
                            s.value(a.0, a.1, size: list.count > 3 ? 7.6 : 9).lineLimit(1)
                            Text(L10n.tr(part.key)).font(s.sans(3.2)).foregroundStyle(s.t.muted).padding(.top, -u * 1)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }
}

/// The half dial of Jídlo C: a track with ticks, the filled part and a knob.
struct ShareDial<Center: View>: View {
    let progress: Double
    let color: Color
    let track: Color
    let tick: Color
    let hole: Color
    let u: CGFloat
    @ViewBuilder let center: () -> Center

    var body: some View {
        GeometryReader { geo in
            let line = u * 4.6
            let r = geo.size.width / 2 - line / 2
            let c = CGPoint(x: geo.size.width / 2, y: geo.size.width / 2)
            let arc = Path { $0.addArc(center: c, radius: r, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false) }
            let p: Double = min(1, max(0, progress))
            let angle: Double = Double.pi * (1 + p)
            let knob = CGPoint(x: c.x + r * CGFloat(cos(angle)), y: c.y + r * CGFloat(sin(angle)))
            ZStack(alignment: .topLeading) {
                arc.stroke(track, style: StrokeStyle(lineWidth: line, lineCap: .round))
                Path { path in
                    for i in 0...20 {
                        let a = Double.pi * (1 + Double(i) / 20)
                        let cx = CGFloat(cos(a)), sy = CGFloat(sin(a))
                        path.move(to: CGPoint(x: c.x + (r - line * 1.3) * cx, y: c.y + (r - line * 1.3) * sy))
                        path.addLine(to: CGPoint(x: c.x + (r - line * 1.9) * cx, y: c.y + (r - line * 1.9) * sy))
                    }
                }
                .stroke(tick, lineWidth: u * 0.4)
                arc.trim(from: 0, to: max(0.001, p))
                    .stroke(LinearGradient(colors: [color.opacity(0.35), color], startPoint: .leading, endPoint: .trailing),
                            style: StrokeStyle(lineWidth: line, lineCap: .round))
                    .shadow(color: color.opacity(0.4), radius: u * 2)
                Circle().strokeBorder(color, lineWidth: u * 1.2).background(Circle().fill(hole))
                    .frame(width: line * 1.7, height: line * 1.7)
                    .position(knob)
                center()
                    .frame(width: geo.size.width)
                    .position(x: c.x, y: c.y - u * 9)
            }
        }
    }
}
