import SwiftUI

/// The Apple Watch app: Today from the iPhone (WatchStore), drawn in the
/// watch's own black with a coloured glow per page.
@main
struct AurinWatchApp: App {
    @StateObject private var store = WatchStore.shared
    @Environment(\.scenePhase) private var phase

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
                }
        }
    }
}

struct WatchRoot: View {
    @EnvironmentObject private var store: WatchStore
    @ObservedObject private var alarm = WatchAlarm.shared

    var body: some View {
        // By the crown: readiness, the day's training (TrainingPage), food and drink (FoodPage).
        NavigationStack {
            TabView {
                if let snapshot = store.snapshot, snapshot.date == WatchStore.localDate(Date()) {
                    ReadinessHome(s: snapshot)
                } else {
                    WaitingView(stale: store.snapshot != nil)
                }
                TrainingPage()
                FoodPage()
            }
            .tabViewStyle(.verticalPage)
            // Here, not inside a page: the vertical pages are lazy, and a
            // destination declared in one was never found by the stack.
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
