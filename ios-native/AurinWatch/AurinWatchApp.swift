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
                    if now == .active { store.ask() }
                }
        }
    }
}

struct WatchRoot: View {
    @EnvironmentObject private var store: WatchStore

    var body: some View {
        // By the crown: readiness, then the day's training (TrainingPage).
        NavigationStack {
            TabView {
                if let snapshot = store.snapshot, snapshot.date == WatchStore.localDate(Date()) {
                    ReadinessHome(s: snapshot)
                } else {
                    WaitingView(stale: store.snapshot != nil)
                }
                TrainingPage()
            }
            .tabViewStyle(.verticalPage)
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
