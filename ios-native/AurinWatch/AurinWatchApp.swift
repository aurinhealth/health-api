import HealthKit
import SwiftUI
import WatchKit

/// The Apple Watch app: Today from the iPhone (WatchStore), drawn in the
/// watch's own black with a coloured glow per page.
@main
struct AurinWatchApp: App {
    @StateObject private var store = WatchStore.shared
    @Environment(\.scenePhase) private var phase
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            WatchRoot()
                .environmentObject(store)
                .task { store.start() }
                .onChange(of: phase) { _, now in
                    if now == .active {
                        store.ask()
                        WatchAlarm.shared.schedule()
                    }
                    if now == .background {
                        store.sendDrink()
                        store.scheduleMorning()
                    }
                }
        }
        // In the morning: today from the server before the first look at the watch.
        .backgroundTask(.appRefresh(WatchStore.morningTask)) {
            await WatchStore.shared.fromServer()
            await WatchStore.shared.scheduleMorning()
        }
        // The coach's pushes from the iPhone, in the watch's own look.
        WKNotificationScene(controller: CoachNotificationController.self, category: "COACH_SWAP")
        WKNotificationScene(controller: CoachNotificationController.self, category: "COACH_REPLY")
        WKNotificationScene(controller: CoachNotificationController.self, category: "COACH_ACTION")
    }
}

/// Training mode on the iPhone starts the gym here (HKHealthStore.startWatchApp
/// in App/LiveWorkout.swift): the watch opens it and runs the workout.
@MainActor
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        GymStore.shared.openFromPhone()
    }

    /// Relaunched while the gym's workout was running: it goes on where it was.
    func handleActiveWorkoutRecovery() {
        Task {
            guard await GymWorkout.shared.recover() else { return }
            GymStore.shared.openedFromPhone = true
        }
    }
}

struct WatchRoot: View {
    @EnvironmentObject private var store: WatchStore
    @ObservedObject private var alarm = WatchAlarm.shared
    @ObservedObject private var gym = GymStore.shared
    @State private var page = "readiness"
    @State private var path = NavigationPath()

    var body: some View {
        // By the crown: readiness, then the day's training (TrainingPage) and food and drink (FoodPage).
        NavigationStack(path: $path) {
            TabView(selection: $page) {
                Group {
                    if let snapshot = store.snapshot, snapshot.date == WatchStore.localDate(Date()) {
                        ReadinessHome(s: snapshot)
                    } else {
                        WaitingView(stale: store.snapshot != nil)
                    }
                }
                .tag("readiness")
                // The rest in the order Settings → Apple Watch on the iPhone gives.
                ForEach(store.settings.pages.filter { $0 != "readiness" }, id: \.self) { page in
                    switch page {
                    case "training": TrainingPage().tag("training")
                    case "food": FoodPage().tag("food")
                    default: EmptyView()
                    }
                }
            }
            .tabViewStyle(.verticalPage)
            .onOpenURL(perform: open)
            .fullScreenCover(isPresented: $gym.openedFromPhone) { GymSessionView() }
            // Here, not inside a page: the vertical pages are lazy, and a
            // destination declared in one was never found by the stack.
            .navigationDestination(for: WatchSnapshot.Session.self) { session in
                RideDetail(session: session)
            }
            .navigationDestination(for: ReadinessHome.Page.self) { page in
                if let s = store.snapshot {
                    switch page {
                    case .why: WhyDetail(s: s)
                    case .sleep: SleepDetail(s: s)
                    case .restingHR: MetricDetail(s: s, metric: .restingHR)
                    case .hrv: MetricDetail(s: s, metric: .hrv)
                    case .strain: StrainDetail(s: s)
                    case .alarm: AlarmView()
                    case .coach: CoachView()
                    }
                }
            }
        }
        .fullScreenCover(isPresented: Binding(get: { alarm.ringing }, set: { if !$0 { alarm.stop() } })) {
            AlarmRinging()
        }
    }

    /// A tap on a complication (aurinwatch://open/<page>, AurinWatchWidgets Link):
    /// its page, and the detail for a number.
    private func open(_ url: URL) {
        guard url.scheme == "aurinwatch", !gym.openedFromPhone else { return }
        path = NavigationPath()
        let target = url.lastPathComponent
        let details: [String: ReadinessHome.Page] = ["sleep": .sleep, "restingHR": .restingHR, "hrv": .hrv, "strain": .strain, "alarm": .alarm]
        let detail = details[target]
        let pages = store.settings.pages
        if target == "training" || target == "food", pages.contains(target) {
            page = target
        } else {
            page = "readiness"
        }
        if let detail, store.snapshot != nil { path.append(detail) }
    }
}

/// Nothing from the iPhone yet today.
struct WaitingView: View {
    let stale: Bool

    var body: some View {
        VStack(spacing: 8) {
            Ring(fraction: 0, color: W.green, size: 64) {
                Image(systemName: "iphone")
                    .font(.system(size: 20))
                    .foregroundStyle(W.green)
            }
            Text(W.tr("Otevři Aurin v iPhonu", "Open Aurin on your iPhone"))
                .font(W.serif(19))
                .multilineTextAlignment(.center)
            Text(stale ? W.tr("Hodinky čekají na dnešní data.", "Your watch is waiting for today's data.")
                       : W.tr("Hodinky dostanou dnešek z iPhonu.", "Your watch gets today from your iPhone."))
                .font(W.news(13))
                .foregroundStyle(W.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 6)
        .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
        .containerBackground(W.glow(W.Glow.readiness), for: .tabView)
    }
}
