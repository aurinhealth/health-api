import HealthKit
import SwiftUI
import WorkoutKit

/// A planned ride or run as a WorkoutKit custom workout for the Apple Watch
/// Workout app: each block with its repeats, each step for its time with the
/// target the plan resolved for the athlete (watts from FTP, pace from the
/// threshold pace, else the heart-rate zone). The system preview sheet (.workoutPreview) sends it to the
/// watch, so the app needs no scheduling permission of its own.
enum WatchWorkout {
    static func plan(_ workout: PlannedWorkout.Workout, title: String) -> WorkoutPlan? {
        let activity: HKWorkoutActivityType = workout.sport == "run" ? .running : .cycling
        guard CustomWorkout.supportsActivity(activity) else { return nil }
        let blocks: [IntervalBlock] = (workout.steps ?? []).compactMap { block in
            let steps = (block.steps ?? []).compactMap(step)
            return steps.isEmpty ? nil : IntervalBlock(steps: steps, iterations: max(1, block.repeats ?? 1))
        }
        guard !blocks.isEmpty else { return nil }
        let location: HKWorkoutSessionLocationType = workout.environment == "indoor" ? .indoor : .outdoor
        let custom = CustomWorkout(activity: activity, location: location, displayName: String(title.prefix(60)), blocks: blocks)
        return WorkoutPlan(.custom(custom))
    }

    private static func step(_ s: PlannedWorkout.Step) -> IntervalStep? {
        guard let seconds = s.durationSeconds, seconds >= 1 else { return nil }
        // Work from tempo up (76 % of FTP or threshold pace), recovery below.
        let purpose: IntervalStep.Purpose = (s.percentHigh ?? s.percentLow ?? 0) >= 76 ? .work : .recovery
        var step = IntervalStep(purpose)
        step.step.goal = .time(seconds, .seconds)
        if let low = s.wattsLow, let high = s.wattsHigh ?? s.wattsLow, low > 0 {
            step.step.alert = PowerRangeAlert(target: Measurement(value: low, unit: UnitPower.watts)...Measurement(value: max(low, high), unit: UnitPower.watts))
        } else if let slow = s.paceSlow ?? s.paceFast, let fast = s.paceFast ?? s.paceSlow, slow > 0, fast > 0 {
            // Pace (s/km) as speed: the slower pace is the lower speed.
            let lowSpeed = 1000 / max(slow, fast), highSpeed = 1000 / min(slow, fast)
            step.step.alert = SpeedRangeAlert(target: Measurement(value: lowSpeed, unit: UnitSpeed.metersPerSecond)...Measurement(value: highSpeed, unit: UnitSpeed.metersPerSecond), metric: .current)
        } else if let low = s.hrLow, let high = s.hrHigh, low > 0, high > low {
            // No FTP or threshold pace: the heart-rate zone the server matched to the step (bpm as Hz).
            step.step.alert = HeartRateRangeAlert(target: Measurement(value: low / 60, unit: UnitFrequency.hertz)...Measurement(value: high / 60, unit: UnitFrequency.hertz))
        }
        return step
    }
}

/// "Do Apple Watch": the system preview of the workout with its own button
/// that adds it to the watch's Workout app.
struct WatchWorkoutButton: View {
    let workout: PlannedWorkout.Workout
    let title: String
    @State private var plan: WorkoutPlan?
    @State private var showing = false

    var body: some View {
        Group {
            if let plan {
                Button { showing = true } label: {
                    Label("Do Apple Watch", systemImage: "applewatch")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .workoutPreview(plan, isPresented: $showing)
            }
        }
        .onAppear { plan = WatchWorkout.plan(workout, title: title) }
    }
}
