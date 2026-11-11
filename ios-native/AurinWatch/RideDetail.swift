import SwiftUI
import WatchConnectivity
import WidgetKit

/// A planned ride's, run's or swim's steps (mockup 44): asked from the iPhone when it
/// is in reach, else from the server with the watch's own sign-in, and kept
/// on the watch for the day, so a relaunch shows them without asking again.
/// A session whose name or length changed (the coach swapped it) is asked again.
@MainActor
final class PlanStore: ObservableObject {
    static let shared = PlanStore()
    private static let savedKey = "watchPlans"
    @Published private(set) var plans: [String: WatchPlan] = [:]
    @Published private(set) var failed: Set<String> = []
    private var asking: Set<String> = []
    /// Plans asked for without the complication (a brick's next leg), and the one it has.
    private var quiet: Set<String> = []
    private var shelved: String?
    /// The session each plan was asked for (its name and length), by event.
    private var stamps: [String: String] = [:]

    private struct Saved: Codable {
        var date: String
        var plans: [String: WatchPlan]
        var stamps: [String: String]
    }

    init() {
        guard !WatchDemo.on, let data = UserDefaults.standard.data(forKey: Self.savedKey),
              let saved = try? JSONDecoder().decode(Saved.self, from: data),
              saved.date == WatchStore.localDate(Date()) else { return }
        plans = saved.plans
        stamps = saved.stamps
    }

    /// "|2": plans kept from before the steps had their targets (watts, pace) load again.
    private static func stamp(_ session: WatchSnapshot.Session) -> String {
        "\(session.title)|\(session.minutes ?? 0)|2"
    }

    /// The session's plan; with shelf, also the complication's (the next workout's steps).
    func load(_ session: WatchSnapshot.Session, shelf: Bool = true) {
        guard let id = session.eventId else { return }
        // The sample day's race (WatchDemo -race): its plans without the iPhone or the server.
        if WatchDemo.on {
            if plans[id] == nil, let plan = WatchDemo.plan(id) { plans[id] = plan }
            return
        }
        if let plan = plans[id], stamps[id] == Self.stamp(session) {
            if shelf, shelved != id { save(plan, id: id) }
            return
        }
        if shelf { quiet.remove(id) } else if !asking.contains(id) { quiet.insert(id) }
        guard !asking.contains(id) else { return }
        stamps[id] = Self.stamp(session)
        asking.insert(id)
        failed.remove(id)
        let request = WatchPlan.Request(eventId: id, date: session.date)
        let wc = WCSession.isSupported() ? WCSession.default : nil
        if let wc, wc.activationState == .activated, wc.isReachable, let data = try? JSONEncoder().encode(request) {
            wc.sendMessage([WatchPlan.requestKey: data], replyHandler: { reply in
                let plan = (reply[WatchPlan.replyKey] as? Data).flatMap(WatchPlan.decode)
                Task { @MainActor in PlanStore.shared.received(plan, id: id, request: request) }
            }, errorHandler: { _ in
                Task { @MainActor in PlanStore.shared.received(nil, id: id, request: request) }
            })
        } else {
            Task { await fromServer(request) }
        }
    }

    private func received(_ plan: WatchPlan?, id: String, request: WatchPlan.Request) {
        if let plan { finish(plan, id: id) } else { Task { await fromServer(request) } }
    }

    private func fromServer(_ request: WatchPlan.Request) async {
        finish(await WatchAPI.plan(request), id: request.eventId)
    }

    private func finish(_ plan: WatchPlan?, id: String) {
        asking.remove(id)
        if let plan {
            plans[id] = plan
            if !quiet.contains(id) { save(plan, id: id) }
            keep()
        } else {
            failed.insert(id)
        }
        quiet.remove(id)
    }

    /// The day's plans on the watch; another day's are dropped.
    private func keep() {
        let saved = Saved(date: WatchStore.localDate(Date()), plans: plans, stamps: stamps.filter { plans[$0.key] != nil })
        if let data = try? JSONEncoder().encode(saved) { UserDefaults.standard.set(data, forKey: Self.savedKey) }
    }

    private func save(_ plan: WatchPlan, id: String) {
        guard !plan.steps.isEmpty else { return }
        shelved = id
        ComplicationShelf.save(plan: plan, id: id)
        WidgetCenter.shared.reloadTimelines(ofKind: "aurin.wide.workout")
        WidgetCenter.shared.reloadTimelines(ofKind: "aurin.wide.aurin")
    }

    static func color(_ zone: Int) -> Color {
        switch zone {
        case 1: Color(hex: 0x6B7275)
        case 2: W.blue
        case 3: W.green
        case 4: W.amber
        case 5: Color(hex: 0xF0907A)
        default: W.indigo
        }
    }
}

/// The steps as blocks over time, their height and colour by zone.
struct PlanBars: View {
    let plan: WatchPlan

    var body: some View {
        let steps = plan.ridden
        let total = max(steps.map(\.seconds).reduce(0, +), 1)
        GeometryReader { geo in
            let gap: CGFloat = steps.count > 40 ? 0.5 : 1
            let width = geo.size.width - gap * CGFloat(max(steps.count - 1, 0))
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(steps.enumerated()), id: \.offset) { _, s in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(PlanStore.color(s.zone))
                        .frame(width: max(1, width * CGFloat(s.seconds / total)),
                               height: geo.size.height * CGFloat(0.28 + 0.12 * Double(min(s.zone, 6))))
                }
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .accessibilityHidden(true)
    }
}

/// Tapping a ride or run on Training: what it is, its chart, and by the
/// crown every step with its length and zone.
struct RideDetail: View {
    let session: WatchSnapshot.Session
    @EnvironmentObject private var watch: WatchStore
    @ObservedObject private var plans = PlanStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    Image(systemName: W.sportSymbol(session.sport)).watchFont(12)
                    Text(when.uppercased()).watchFont(12, .semibold)
                }
                .foregroundStyle(W.amber)
                Text(TrainingPage.name(session))
                    .font(W.news(19))
                    .foregroundStyle(W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
                if let plan, !plan.steps.isEmpty {
                    PlanBars(plan: plan).frame(height: 40).padding(.top, 10)
                    axis(plan).padding(.top, 3)
                    // Today's start, as on the Training page's card (a brick starts with its next leg).
                    if WorkoutOpener.canStart(session, plan: plan, today: today, sessions: sessions) {
                        OpenInWorkoutButton { try await WorkoutOpener.start(session, plan: plan, sessions: sessions) }
                            .padding(.top, 8)
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(rows(plan).enumerated()), id: \.offset) { _, row in
                            stepRow(row)
                        }
                    }
                    .padding(.top, 6)
                    Text(footer)
                        .watchFont(12)
                        .foregroundStyle(W.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                } else if let id = session.eventId, plans.failed.contains(id) {
                    Text(W.tr("Kroky teď nejdou načíst. Otevři Aurin v iPhonu.", "The steps won't load right now. Open Aurin on your iPhone."))
                        .watchFont(12).foregroundStyle(W.secondary).padding(.top, 10)
                } else if session.eventId != nil, plan == nil {
                    HStack(spacing: 6) {
                        ProgressView().frame(width: 20, height: 20)
                        Text(W.tr("Načítám kroky…", "Loading steps…")).watchFont(12).foregroundStyle(W.secondary)
                    }
                    .padding(.top, 14)
                } else {
                    Text(W.tr("Tenhle trénink nemá kroky.", "This session has no steps."))
                        .watchFont(12).foregroundStyle(W.secondary).padding(.top, 10)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear {
            plans.load(session)
            if let leg = WorkoutOpener.nextLeg(session, in: sessions) { plans.load(leg, shelf: false) }
        }
        .containerBackground(W.glow(W.Glow.strain), for: .navigation)
    }

    private var plan: WatchPlan? { session.eventId.flatMap { plans.plans[$0] } }
    private var today: String { WatchStore.localDate(WatchDemo.now) }
    private var sessions: [WatchSnapshot.Session] {
        guard let s = watch.snapshot, s.date == today else { return [] }
        return s.week ?? []
    }

    /// Where it starts, by sport: only a ride from Wahoo too.
    private var footer: String {
        switch session.sport {
        case "ride": W.tr("Jeď ho z Wahoo nebo z aplikace Cvičení. Kouč ho změní v iPhonu.",
                          "Ride it from Wahoo or the Workout app. Your coach can change it on your iPhone.")
        case "swim": W.tr("Plav ho z aplikace Cvičení. Kouč ho změní v iPhonu.",
                          "Swim it from the Workout app. Your coach can change it on your iPhone.")
        default: W.tr("Běž ho z aplikace Cvičení. Kouč ho změní v iPhonu.",
                      "Run it from the Workout app. Your coach can change it on your iPhone.")
        }
    }

    /// "ZÍTRA, 60 MIN".
    private var when: String {
        let day = W.relativeDay(session.date)
        let minutes = session.minutes ?? plan?.minutes
        return day + (session.time.map { ", " + W.clockText($0) } ?? "") + (minutes.map { ", \($0) min" } ?? "")
    }

    private func axis(_ plan: WatchPlan) -> some View {
        let total = Int((plan.ridden.map(\.seconds).reduce(0, +) / 60).rounded())
        return HStack {
            Text("0")
            Spacer()
            Text("\(total / 2) min")
            Spacer()
            Text("\(total)")
        }
        .watchFont(12)
        .foregroundStyle(W.muted)
    }

    private struct Row {
        var length: String
        var label: String
        var zone: Int
    }

    /// One line per step; a repeated block shows once as "4 × 3′", a pool swim as "4 × 100 m".
    private func rows(_ plan: WatchPlan) -> [Row] {
        plan.steps.map { s in
            let minutes = s.seconds >= 60 ? W.number(s.seconds / 60, digits: s.seconds.truncatingRemainder(dividingBy: 60) == 0 ? 0 : 1) + "′" : "\(Int(s.seconds))″"
            let length = plan.openWater != true ? s.meters.map { "\(Int($0.rounded())) m" } ?? minutes : minutes
            return Row(length: s.repeats > 1 ? "\(s.repeats) × " + length : length, label: s.label, zone: s.zone)
        }
    }

    private func stepRow(_ row: Row) -> some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 2).fill(PlanStore.color(row.zone)).frame(width: 4, height: 16)
            Text(row.length).watchFont(12, .semibold).foregroundStyle(W.ink)
                .frame(minWidth: 40, alignment: .leading)
            Text(row.label).watchFont(12).foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 2)
            Text("Z\(row.zone)").watchFont(12, .semibold).foregroundStyle(PlanStore.color(row.zone))
        }
        .padding(.vertical, 3)
    }
}
