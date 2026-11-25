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

    /// Zone colour set B (Palette.Zone, dark), as on the iPhone.
    static func color(_ zone: Int) -> Color {
        switch zone {
        case 1: Color(hex: 0x8C928F)
        case 2: Color(hex: 0x86A9FF)
        case 3: Color(hex: 0x8FE6C4)
        case 4: Color(hex: 0xE09A55)
        case 5: Color(hex: 0xEC4A58)
        case 6: Color(hex: 0xD98BF0)
        default: Color(hex: 0xFF7EB6)
        }
    }
}

/// Tapping a ride, run or swim on Training (watch concept 05): its name in
/// the serif and every step on a row, a bar in its zone's colour (grey for a
/// swim, which has no zone), the step and its length, the zone and target
/// under it; Start in Workout pinned at the bottom. The Workout app runs it.
struct RideDetail: View {
    let session: WatchSnapshot.Session
    @EnvironmentObject private var watch: WatchStore
    @ObservedObject private var plans = PlanStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(TrainingPage.name(session))
                    .font(W.serif(21))
                    .foregroundStyle(W.num)
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 3)
                if let plan, !plan.steps.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(rows(plan).enumerated()), id: \.offset) { _, row in
                            Rectangle().fill(W.hair).frame(height: 1)
                            stepRow(row)
                        }
                    }
                    .padding(.top, 4)
                } else if let id = session.eventId, plans.failed.contains(id) {
                    Text(W.tr("Kroky teď nejdou načíst. Otevři Aurin v iPhonu.", "The steps won't load right now. Open Aurin on your iPhone."))
                        .watchFont(13).foregroundStyle(W.secondary).padding(.top, 10)
                } else if session.eventId != nil, plan == nil {
                    HStack(spacing: 6) {
                        ProgressView().frame(width: 20, height: 20)
                        Text(W.tr("Načítám kroky…", "Loading steps…")).watchFont(13).foregroundStyle(W.secondary)
                    }
                    .padding(.top, 14)
                } else {
                    Text(W.tr("Tenhle trénink nemá kroky.", "This session has no steps."))
                        .watchFont(13).foregroundStyle(W.secondary).padding(.top, 10)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // Today's start pinned at the bottom (a brick starts with its next leg).
        .safeAreaInset(edge: .bottom) {
            if let plan, WorkoutOpener.canStart(session, plan: plan, today: today, sessions: sessions) {
                OpenInWorkoutButton { try await WorkoutOpener.start(session, plan: plan, sessions: sessions) }
            }
        }
        .onAppear {
            plans.load(session)
            if let leg = WorkoutOpener.nextLeg(session, in: sessions) { plans.load(leg, shelf: false) }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: ReadinessHome.Page.coach) { WatchCoachLights() }
                    .accessibilityLabel(W.tr("Kouč", "Coach"))
            }
        }
        .containerBackground(W.glow(Self.glow(session.sport)), for: .navigation)
    }

    /// The sport's tint at the top (concept 05): ride violet, run orange, swim blue.
    static func glow(_ sport: String) -> Color {
        switch sport {
        case "ride": Color(hex: 0x2E2456)
        case "run": Color(hex: 0x4A2608)
        case "swim": Color(hex: 0x0B3346)
        default: W.Glow.readiness
        }
    }

    private var plan: WatchPlan? { session.eventId.flatMap { plans.plans[$0] } }
    private var today: String { WatchStore.localDate(WatchDemo.now) }
    private var sessions: [WatchSnapshot.Session] {
        guard let s = watch.snapshot, s.date == today else { return [] }
        return s.week ?? []
    }

    private struct Row {
        var title: String
        var length: String
        var detail: String?
        var color: Color
    }

    /// One row per step; a repeated block once as "5 × 4 min", a pool swim as "8 × 100 m".
    private func rows(_ plan: WatchPlan) -> [Row] {
        let swim = session.sport == "swim"
        return plan.steps.map { s in
            let whole = s.seconds.truncatingRemainder(dividingBy: 60) == 0
            let minutes = s.seconds < 60 ? "\(Int(s.seconds)) s"
                : whole ? W.duration(minutes: s.seconds / 60) : W.number(s.seconds / 60, digits: 1) + " min"
            let length = plan.openWater != true ? s.meters.map { "\(Int($0.rounded())) m" } ?? minutes : minutes
            return Row(title: s.label, length: s.repeats > 1 ? "\(s.repeats) × " + length : length,
                       detail: swim ? nil : target(s), color: swim ? W.dim : PlanStore.color(s.zone))
        }
    }

    /// "Zone 2, 150 to 205 W", "Zone 4, 4:20 /km" (per mile in imperial).
    private func target(_ s: WatchPlan.Step) -> String {
        var text = W.tr("Zóna ", "Zone ") + String(s.zone)
        if let low = s.wattsLow, let high = s.wattsHigh {
            text += ", " + (low > 0 ? W.number(low) + W.tr(" až ", " to ") : W.tr("do ", "up to ")) + W.number(high) + " W"
        } else if let pace = s.pace, pace > 0 {
            let shown = W.runPace(pace)
            text += ", " + shown.value + " " + shown.unit
        }
        return text
    }

    private func stepRow(_ row: Row) -> some View {
        HStack(alignment: .top, spacing: 7) {
            RoundedRectangle(cornerRadius: 2).fill(row.color).frame(width: 4)
                .padding(.vertical, 2)
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline) {
                    Text(row.title).watchFont(15, .medium).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 4)
                    Text(row.length).watchFont(13, .medium).foregroundStyle(W.ink).lineLimit(1)
                }
                if let detail = row.detail {
                    Text(detail).watchFont(13).foregroundStyle(W.muted).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }
}
