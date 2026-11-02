import UIKit

/// Keeps the iPhone's screen on while a workout screen needs it, and lets it
/// sleep as usual when the Apple Watch runs the workout: the watch shows the
/// set, the rest and the heart rate, the lock screen shows the Live Activity,
/// and an hour of a lit screen is the largest part of the battery a gym takes.
/// Without the watch, or once its workout stops sending, the screen stays on.
///
/// Each screen holds it by its own name, so a screen closing on top of
/// another (stretching inside Režim tréninku) doesn't let the one below sleep.
@MainActor
enum ScreenAwake {
    /// The screens holding it, and whether each may sleep while the watch leads.
    private static var holders: [String: Bool] = [:]

    /// `watchMaySleep` false: a screen the user follows second by second on
    /// the iPhone itself (the stretching and cardio countdowns) stays on anyway.
    static func hold(_ name: String, watchMaySleep: Bool = true) {
        holders[name] = watchMaySleep
        apply()
    }

    static func release(_ name: String) {
        holders[name] = nil
        apply()
    }

    /// Again when the watch's workout starts or stops sending (LiveWorkout).
    static func apply() {
        let watch = LiveWorkout.shared.watchLeads
        let awake = holders.values.contains { maySleep in !(maySleep && watch) }
        if UIApplication.shared.isIdleTimerDisabled != awake { UIApplication.shared.isIdleTimerDisabled = awake }
    }
}
