import Foundation
import Observation

/// Low Power Mode on the iPhone (Settings → Battery): the decorative motion
/// (the weather's sky, the drink figure's water, the coach's dots) stands still.
@MainActor
@Observable
final class LowPower {
    static let shared = LowPower()

    private(set) var on = ProcessInfo.processInfo.isLowPowerModeEnabled

    private init() {
        NotificationCenter.default.addObserver(forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main) { _ in
            Task { @MainActor in LowPower.shared.update() }
        }
    }

    private func update() {
        let now = ProcessInfo.processInfo.isLowPowerModeEnabled
        if on != now { on = now }
    }
}
