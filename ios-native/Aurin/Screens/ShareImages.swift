import LinkPresentation
import SwiftUI
import UIKit

// MARK: - Share images (Sdílet on Dnes and in a workout's detail)

/// What a share image shows: the day, one workout, the day's nutrition, the
/// week or a milestone.
enum ShareKind: String, CaseIterable, Identifiable {
    case day, activity, food, week, milestone

    var id: String { rawValue }

    var title: String {
        switch self {
        case .day: return "Den"
        case .activity: return "Aktivita"
        case .food: return "Jídlo"
        case .week: return "Týden"
        case .milestone: return "Milník"
        }
    }

    /// The layouts under the preview, in the order of the thumbnails.
    var variants: [String] {
        switch self {
        case .day: return ["Osa", "Čísla", "Velké", "Dlaždice"]
        case .activity: return ["Trasa", "Graf", "Čísla"]
        case .food: return ["Makra", "Rozdělení", "Oblouk"]
        case .week: return ["Po dnech", "Kolečka", "Čísla", "Proti minulému"]
        case .milestone: return ["Plakát", "Cesta", "Rekord"]
        }
    }

    /// The layouts this image offers, by index: a gym workout shows its
    /// exercises instead of a route, and a chart only with its heart rate.
    func layouts(_ workout: ShareWorkout?) -> [(index: Int, name: String)] {
        guard self == .activity, let workout, workout.isGym else { return variants.enumerated().map { ($0.offset, $0.element) } }
        return [(0, "Cviky")] + (workout.curve.count >= 2 ? [(1, "Graf")] : []) + [(2, "Čísla")]
    }

    /// The rows Upravit switches on and off, in their order.
    var rows: [String] {
        switch self {
        case .day: return ShareDay.rows
        case .activity: return ShareWorkout.stats
        case .food: return ShareFood.rows
        case .week: return ShareWeek.rows
        case .milestone: return ShareMilestones.rows
        }
    }
}

/// The choices of Upravit for one kind, kept for the next time.
struct ShareOptions: Codable, Equatable {
    var variant = 0
    var dark = true
    var clear = false
    /// Rows switched off; a row added later starts switched on.
    var hidden: [String] = []
    /// Den: what the night and a workout show on the line.
    var sleep: [String] = ["HRV", "Tep"]
    var workout: [String] = ["Vzdálenost", "Výkon", "Délka"]
    /// Milník: ride, run, gym or streak; nil for the newest.
    var milestone: String?

    func shows(_ row: String) -> Bool { !hidden.contains(row) }

    mutating func toggle(_ row: String) {
        if let i = hidden.firstIndex(of: row) { hidden.remove(at: i) } else { hidden.append(row) }
    }

    static func load(_ kind: ShareKind) -> ShareOptions {
        guard let data = UserDefaults.standard.data(forKey: key(kind)),
              let options = try? JSONDecoder().decode(ShareOptions.self, from: data) else { return ShareOptions() }
        return options
    }

    func save(_ kind: ShareKind) {
        if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.key(kind)) }
    }

    private static func key(_ kind: ShareKind) -> String { "share.options." + kind.rawValue }
}

// MARK: - Colours

/// The image's own colours (Shared/Palette.swift, dark and light), fixed
/// because the picture is drawn once for whoever sees it.
struct ShareTheme {
    let dark: Bool
    let clear: Bool

    private func pick(_ light: UInt32, _ dark: UInt32) -> Color { Color(hex: self.dark ? dark : light) }

    var ink: Color { pick(0x1B1A17, 0xECEAE6) }
    var secondary: Color { pick(0x3B3832, 0xD9D6D0) }
    var muted: Color { pick(0x6D6A63, 0x9AA39F) }
    var green: Color { pick(0x1F6B52, 0x8FE6C4) }
    var amber: Color { pick(0xA35A12, 0xF2B46B) }
    var indigo: Color { pick(0x4F46C8, 0xA5A1FF) }
    var rust: Color { pick(0xB4532F, 0xF0907A) }
    var blue: Color { pick(0x1D6FA3, 0x7CC3F0) }
    var protein: Color { pick(0x2F7FD8, 0x83C7FF) }
    var carbs: Color { pick(0xD98A06, 0xFFC274) }
    var fat: Color { pick(0x7C5CE0, 0xB3A1FF) }
    var zoneGrey: Color { pick(0xB9B4AA, 0x5D6662) }
    /// The inside of a ring dot: the card behind it, or nothing on a photo.
    var hole: Color { clear ? .clear : pick(0xFBFAF7, 0x0B0C0D) }
    /// Tracks, hairlines and chips.
    func line(_ opacity: Double) -> Color { ink.opacity(opacity) }

    enum Glow { case warm, green, indigo, rust }

    /// The glow at the top (at the bottom for rust) fading into the background.
    @ViewBuilder func background(_ glow: Glow, width: CGFloat) -> some View {
        if clear {
            Color.clear
        } else {
            let base = pick(0xF3EFE8, 0x0B0C0D)
            let tint: Color = {
                switch glow {
                case .warm: return pick(0xF3E1C6, 0x2C2416)
                case .green: return pick(0xD6EADF, 0x17342C)
                case .indigo: return pick(0xE0E2F4, 0x24254A)
                case .rust: return pick(0xF2DCCB, 0x3A2119)
                }
            }()
            RadialGradient(colors: [tint, base], center: glow == .rust ? .bottom : .top, startRadius: 0, endRadius: width * 0.85)
                .background(base)
        }
    }
}

// MARK: - Data

/// The day for Den: the night, readiness, up to three workouts, strain and
/// steps, each at the time it really happened.
struct ShareDay: Equatable {
    static let rows = ["Spánek", "Připravenost", "Trénink", "Námaha", "Kroky"]
    static let sleepStats = ["HRV", "Tep", "Hluboký", "REM", "Skóre"]
    static let workoutStats = ["Vzdálenost", "Výkon", "Tep", "Délka"]

    var date: String
    var readiness: Int?
    var zone: String?
    var sleepMinutes: Double?
    var sleepNeed: Int?
    var sleepStart: String?
    var sleepEnd: String?
    var sleepScore: Int?
    var hrv: Double?
    var restingHR: Double?
    var deepMinutes: Double?
    var remMinutes: Double?
    var strain: Double?
    var strainLow: Double?
    var strainHigh: Double?
    var steps: Double?
    var stepsGoal: Double?
    /// When the steps were counted: now for today, nil for an earlier day.
    var stepsTime: String?
    var workouts: [ShareWorkout] = []

    init(date: String) { self.date = date }

    init(today: TodaySnapshot, now: Date = Date()) {
        date = today.date
        readiness = today.readiness.score
        zone = today.readiness.zone
        sleepMinutes = today.sleep?.minutes
        sleepNeed = today.sleep?.need
        sleepStart = today.sleep?.start
        sleepEnd = today.sleep?.end
        sleepScore = today.sleep?.index
        hrv = today.hrv?.value
        restingHR = today.restingHR?.value
        strain = today.strain.score
        strainLow = today.strain.target?.low
        strainHigh = today.strain.target?.high
        steps = today.steps.today
        stepsGoal = today.steps.goal
        stepsTime = today.steps.hour != nil ? ShareDay.clock(now) : nil
        workouts = ShareDay.doneWorkouts(today).map { ShareWorkout(item: $0) }
    }

    /// The night's deep sleep and REM from its stages.
    mutating func add(_ night: NightDetail) {
        guard let segments = night.night?.segments, !segments.isEmpty else { return }
        let minutes = { (type: String) -> Double in segments.filter { $0.type == type }.reduce(0.0) { $0 + max(0, $1.e - $1.s) } }
        let deep = minutes("DEEP"), rem = minutes("REM")
        if deep > 0 { deepMinutes = deep }
        if rem > 0 { remMinutes = rem }
        if hrv == nil { hrv = night.night?.stats?.hrv }
    }

    var readinessLabel: String? {
        switch zone {
        case "green": return "vysoká"
        case "yellow": return "střední"
        case "red": return "nízká"
        default: return nil
        }
    }

    /// "20:30" for a moment, local time.
    static func clock(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    /// "20:30" → minutes after midnight.
    static func minutes(_ clock: String?) -> Int? {
        guard let parts = clock?.split(separator: ":"), parts.count >= 2,
              let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        return h * 60 + m
    }
}

/// One workout: its numbers, route and power or heart-rate curve.
struct ShareWorkout: Equatable {
    static let stats = ["Vzdálenost", "Čas", "Výkon", "Tep", "Převýšení", "Tempo", "Objem", "Série", "Kalorie", "Cviky"]

    var title: String
    var sport: String
    /// Its day, "2026-10-15".
    var date: String?
    /// Start, "17:30".
    var start: String?
    var minutes: Double?
    var distanceKm: Double?
    var watts: Double?
    var normalizedWatts: Double?
    var heartRate: Double?
    var elevation: Double?
    var tss: Double?
    /// Seconds per km, for a run or a walk.
    var pace: Double?
    /// [latitude, longitude] along the way.
    var route: [[Double]] = []
    /// Power (or heart rate without power) over the workout.
    var curve: [Double] = []
    var curveIsPower = false
    /// Time in zones, %, from the lowest.
    var zones: [Double] = []
    /// Gym: the lifted volume in kg, the work sets done and each exercise's best set.
    var volume: Double?
    var sets: Int?
    var best: [Best] = []
    /// The calories the device reported.
    var kcal: Double?

    /// An exercise and its heaviest set, "80 kg × 6".
    struct Best: Equatable, Identifiable {
        let name: String
        let set: String
        var id: String { name }
    }

    var isGym: Bool { sport == "strength" || sport == "gym" }

    init(title: String, sport: String) {
        self.title = title
        self.sport = sport
    }

    init(item: TodaySnapshot.PlanItem) {
        title = item.session?.title ?? item.title
        sport = item.session?.sport ?? item.sport ?? "other"
        date = item.session?.date
        start = item.time
        minutes = item.session?.minutes.map(Double.init)
        tss = item.session?.tss
        kcal = item.session?.kcal
    }

    init(session: WeekSession, detail: ActivityDetail?) {
        title = detail?.activity.name ?? session.title
        sport = session.sport
        date = session.date
        start = session.time
        minutes = session.minutes.map(Double.init)
        tss = session.tss
        kcal = session.kcal
        if let detail { add(detail) }
    }

    /// The day's sets from the gym sheet: its name, volume, sets and the best set of each exercise.
    mutating func add(_ gym: GymDay) {
        let done = gym.exercises.filter { $0.sets.contains { $0.done && $0.work } }
        guard !done.isEmpty else { return }
        if let name = gym.planName?.trimmingCharacters(in: .whitespaces), !name.isEmpty { title = name }
        if gym.volume > 0 { volume = gym.volume }
        sets = gym.doneWorkSets
        if minutes == nil, let logged = gym.loggedMinutes, logged > 0 { minutes = Double(logged) }
        let number = { (text: String?) -> Double in text.flatMap(LiftWeight.number) ?? 0 }
        best = done.compactMap { exercise -> Best? in
            let work = exercise.sets.filter { $0.done && $0.work }
            guard let top = work.max(by: { (number($0.kg), number($0.reps)) < (number($1.kg), number($1.reps)) }) else { return nil }
            let reps = number(top.reps)
            let kg = number(top.kg)
            let times = reps > 0 ? "× " + Fmt.int(reps) : ""
            guard kg > 0 else { return reps > 0 ? Best(name: exercise.name, set: times) : nil }
            return Best(name: exercise.name, set: [(LiftWeight.shown(top.kg) ?? Fmt.int(kg)) + " " + Units.weightUnit, times].filter { !$0.isEmpty }.joined(separator: " "))
        }
    }

    mutating func add(_ detail: ActivityDetail) {
        let a = detail.activity
        if let name = a.name, !name.isEmpty { title = name }
        if let m = a.moving_time, m > 0 { minutes = m / 60 }
        distanceKm = a.distance.flatMap { $0 > 0 ? $0 / 1000 : nil }
        watts = a.average_watts.flatMap { $0 > 0 ? $0 : nil }
        normalizedWatts = a.icu_normalized_watts.flatMap { $0 > 0 ? $0 : nil }
        heartRate = a.average_heartrate.flatMap { $0 > 0 ? $0 : nil }
        elevation = a.total_elevation_gain.flatMap { $0 > 0 ? $0 : nil }
        if let load = a.icu_training_load, load > 0 { tss = load }
        if kcal == nil, let calories = a.calories, calories > 0 { kcal = calories }
        if sport == "run" || sport == "walk", let speed = a.average_speed, speed > 0 { pace = 1000 / speed }
        route = (detail.streams?.first { $0.type == "latlng" }?.points ?? []).compactMap { p -> [Double]? in
            guard let ll = p.ll, ll.count == 2, abs(ll[0]) <= 90, abs(ll[1]) <= 180, ll[0] != 0 || ll[1] != 0 else { return nil }
            return ll
        }
        let power = detail.stream("watts")
        if power.count > 10 {
            curve = ShareWorkout.smooth(power)
            curveIsPower = true
        } else {
            curve = ShareWorkout.smooth(detail.stream("heartrate"))
            curveIsPower = false
        }
        let zoneList = curveIsPower ? detail.analysis?.zones : (detail.hrZones ?? detail.analysis?.zones)
        zones = (zoneList ?? []).compactMap(\.percent).prefix(6).map { $0 }
        if zones.reduce(0, +) <= 0 { zones = [] }
    }

    /// End, "18:42".
    var end: String? {
        guard let s = ShareDay.minutes(start), let minutes else { return nil }
        let e = (s + Int(minutes.rounded())) % 1440
        return String(format: "%d:%02d", e / 60, e % 60)
    }

    /// "Kolo", "Běh"… for an untitled workout and the icon.
    var sportName: String {
        ["ride": "Kolo", "run": "Běh", "strength": "Posilovna", "gym": "Posilovna", "walk": "Chůze", "swim": "Plavání"][sport] ?? "Trénink"
    }

    var symbol: String {
        ["ride": "bicycle", "run": "figure.run", "gym": "dumbbell.fill", "strength": "dumbbell.fill", "walk": "figure.walk", "swim": "figure.pool.swim"][sport] ?? "figure.mixed.cardio"
    }

    /// The numbers this workout has, by the stat names of Upravit.
    func value(_ stat: String) -> (value: String, unit: String)? {
        switch stat {
        case "Vzdálenost":
            guard let km = distanceKm else { return nil }
            return (Fmt.decimal(Units.distance(km), digits: km < 100 ? 1 : 0), Units.distanceUnit)
        case "Čas", "Délka":
            guard let minutes, minutes > 0 else { return nil }
            return (Fmt.hoursMinutes(minutes), "h")
        case "Výkon":
            guard let watts else { return nil }
            return (Fmt.int(watts), "W")
        case "Tep":
            guard let heartRate else { return nil }
            return (Fmt.int(heartRate), "bpm")
        case "Převýšení":
            guard let elevation, elevation >= 1 else { return nil }
            return Units.imperial ? (Fmt.int(elevation * 3.28084), "ft") : (Fmt.int(elevation), "m")
        case "Tempo":
            guard let pace else { return nil }
            let s = Int(Units.pace(pace).rounded())
            return ("\(s / 60):" + String(format: "%02d", s % 60), Units.paceUnit)
        case "Zátěž":
            guard let tss, tss > 0 else { return nil }
            return (Fmt.int(tss), "TSS")
        case "Objem":
            guard let volume, volume > 0 else { return nil }
            return (Fmt.int(LiftWeight.shownValue(volume)), Units.weightUnit)
        case "Série":
            guard let sets, sets > 0 else { return nil }
            return (String(sets), "")
        case "Kalorie":
            guard let kcal, kcal > 0 else { return nil }
            return (Fmt.int(kcal), "kcal")
        case "Cviky":
            guard !best.isEmpty else { return nil }
            return (String(best.count), "")
        default:
            return nil
        }
    }

    func stat(_ name: String) -> ShareStat? {
        value(name).map { ShareStat(label: name, value: $0.value, unit: $0.unit) }
    }

    /// The stats with a value, in the order of Upravit.
    var available: [String] { Self.stats.filter { value($0) != nil } }

    /// About 60 points of a long stream, each the mean of its stretch.
    static func smooth(_ values: [Double], points: Int = 60) -> [Double] {
        let clean = values.filter { $0.isFinite && $0 >= 0 }
        guard clean.count > points else { return clean }
        let step = Double(clean.count) / Double(points)
        return (0..<points).map { i -> Double in
            let a = Int(Double(i) * step), b = min(clean.count, max(a + 1, Int(Double(i + 1) * step)))
            let part = clean[a..<b]
            return part.reduce(0, +) / Double(part.count)
        }
    }
}

/// The day's nutrition for Jídlo: energy, macros and water, never meal names.
struct ShareFood: Equatable {
    static let rows = ["Energie", "Bílkoviny", "Sacharidy", "Tuky", "Voda"]

    var date: String
    var kcal: Double?
    var kcalTarget: Double?
    var protein: TodaySnapshot.Macro
    var carbs: TodaySnapshot.Macro
    var fat: TodaySnapshot.Macro
    var waterMl: Double?
    var waterTarget: Double?

    init(date: String, nutrition n: TodaySnapshot.Nutrition) {
        self.date = date
        kcal = n.kcal
        kcalTarget = n.target
        protein = n.protein
        carbs = n.carbs
        fat = n.fat
        waterMl = n.water.ml
        waterTarget = n.water.target
    }
}

// MARK: - Texts

enum ShareText {
    /// "středa 15. 10." / "Wed, Oct 15".
    static func date(_ iso: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "yyyy-MM-dd"
        guard let day = parser.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = L10n.locale
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = L10n.isEnglish ? "EEE, MMM d" : "EEEE d. M."
        return out.string(from: day)
    }

    /// A clock in the phone's format, "18:42" or "6:42 PM".
    static func clock(_ text: String?) -> String { text.map { ClockText.format($0) } ?? "" }

    private static func day(_ iso: String) -> Date? {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: iso)
    }

    private static func format(_ iso: String, _ pattern: String) -> String {
        guard let date = day(iso) else { return iso }
        let out = DateFormatter()
        out.locale = L10n.locale
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = pattern
        return out.string(from: date)
    }

    /// "15. 10." / "Oct 15".
    static func short(_ iso: String) -> String { format(iso, L10n.isEnglish ? "MMM d" : "d. M.") }

    /// "12. června" / "June 12".
    static func dayMonth(_ iso: String) -> String { format(iso, L10n.isEnglish ? "MMMM d" : "d. MMMM") }

    /// "čvn" / "Jun".
    static func month(_ iso: String) -> String { format(iso, "LLL") }

    /// "Po" / "Mon".
    static func weekday(_ iso: String) -> String {
        let text = format(iso, L10n.isEnglish ? "EEE" : "EEEEEE")
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    /// A week: "12.–18. 10.", "28. 9. – 4. 10." / "Oct 12–18".
    static func range(_ start: String, _ end: String) -> String {
        let sameMonth = start.prefix(7) == end.prefix(7)
        if L10n.isEnglish {
            return sameMonth ? format(start, "MMM d") + "–" + format(end, "d") : format(start, "MMM d") + " – " + format(end, "MMM d")
        }
        return sameMonth ? format(start, "d.") + "–" + format(end, "d. M.") : format(start, "d. M.") + " – " + format(end, "d. M.")
    }
}

// MARK: - Export

@MainActor
enum ShareExport {
    /// The image at 1080 × 1920 (Instagram's story size); transparent keeps its alpha.
    static func image<V: View>(_ card: V, clear: Bool) -> UIImage? {
        let renderer = ImageRenderer(content: card.frame(width: ShareCard.width, height: ShareCard.height))
        renderer.scale = 3
        renderer.isOpaque = !clear
        return renderer.uiImage
    }

    /// A PNG in the temporary folder, so the share sheet saves it with its
    /// transparency and a readable name.
    static func file(_ image: UIImage, name: String) -> URL? {
        guard let data = image.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory.appending(path: name + ".png")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    /// Instagram Stories with the image: transparent as a sticker over the
    /// card's colour, otherwise as the whole background. Only with Aurin's
    /// Meta app ID (META_APP_ID in project.yml) and Instagram installed.
    static var instagramURL: URL? {
        let id = (Bundle.main.object(forInfoDictionaryKey: "MetaAppID") as? String ?? "").trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty, !id.hasPrefix("$") else { return nil }
        return URL(string: "instagram-stories://share?source_application=" + id)
    }

    static var canShareToInstagram: Bool { instagramURL.map { UIApplication.shared.canOpenURL($0) } ?? false }

    static func instagram(_ image: UIImage, clear: Bool, dark: Bool) {
        guard let url = instagramURL, let data = image.pngData() else { return }
        var item: [String: Any] = [:]
        if clear {
            item["com.instagram.sharedSticker.stickerImage"] = data
            item["com.instagram.sharedSticker.backgroundTopColor"] = dark ? "#2C2416" : "#F3E1C6"
            item["com.instagram.sharedSticker.backgroundBottomColor"] = dark ? "#0B0C0D" : "#F3EFE8"
        } else {
            item["com.instagram.sharedSticker.backgroundImage"] = data
        }
        UIPasteboard.general.setItems([item], options: [.expirationDate: Date().addingTimeInterval(300)])
        UIApplication.shared.open(url)
    }

    static func present(_ url: URL, title: String, image: UIImage) {
        let sheet = UIActivityViewController(activityItems: [ShareImageItem(url: url, title: title, image: image)], applicationActivities: nil)
        guard var top = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
        while let next = top.presentedViewController { top = next }
        sheet.popoverPresentationController?.sourceView = top.view
        top.present(sheet, animated: true)
    }
}

/// The PNG with its title and preview for the share sheet's header.
final class ShareImageItem: NSObject, UIActivityItemSource {
    let url: URL
    let title: String
    let image: UIImage

    init(url: URL, title: String, image: UIImage) {
        self.url = url
        self.title = title
        self.image = image
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { url }

    func activityViewController(_ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?) -> Any? { url }

    func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
        let metadata = LPLinkMetadata()
        metadata.title = title
        metadata.originalURL = url
        metadata.imageProvider = NSItemProvider(object: image)
        metadata.iconProvider = NSItemProvider(object: image)
        return metadata
    }
}
