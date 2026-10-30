import HealthKit
import SwiftUI
import TipKit
import WorkoutKit

/// A planned ride or run as a WorkoutKit custom workout for the Apple Watch
/// Workout app: its warm-up and cool-down, each block with its repeats, each step for its time with the
/// target the plan resolved for the athlete (watts from FTP, pace from the
/// threshold pace, else the heart-rate zone). The system preview sheet (.workoutPreview) sends it to the
/// watch, so the app needs no scheduling permission of its own. A swim: in
/// the pool each section by its metres and the rests at the wall by time (the
/// watch asks for the pool length at the start; it has no pace alerts in the
/// water); in open water every section by time, without the rests.
enum WatchWorkout {
    static func plan(_ workout: PlannedWorkout.Workout, title: String, openWater: Bool? = nil) -> WorkoutPlan? {
        if workout.sport == "swim" { return swimPlan(workout, title: title, openWater: openWater ?? (workout.environment == "outdoor")) }
        let activity: HKWorkoutActivityType = workout.sport == "run" ? .running : .cycling
        guard CustomWorkout.supportsActivity(activity) else { return nil }
        var source = workout.steps ?? []
        // The plan's own warm-up and cool-down steps become the watch's.
        let single = { (block: PlannedWorkout.Block?, kind: String) -> PlannedWorkout.Step? in
            guard let block, (block.repeats ?? 1) <= 1, let steps = block.steps, steps.count == 1, steps[0].intensity == kind else { return nil }
            return steps[0]
        }
        let warmupStep = source.count > 1 ? single(source.first, "warmup").flatMap(workoutStep) : nil
        if warmupStep != nil { source.removeFirst() }
        let cooldownStep = source.count > 1 ? single(source.last, "cooldown").flatMap(workoutStep) : nil
        if cooldownStep != nil { source.removeLast() }
        let blocks: [IntervalBlock] = source.compactMap { block in
            let steps = (block.steps ?? []).compactMap(step)
            return steps.isEmpty ? nil : IntervalBlock(steps: steps, iterations: max(1, block.repeats ?? 1))
        }
        guard !blocks.isEmpty else { return nil }
        let location: HKWorkoutSessionLocationType = workout.environment == "indoor" ? .indoor : .outdoor
        let custom = CustomWorkout(activity: activity, location: location, displayName: String(title.prefix(60)), warmup: warmupStep, blocks: blocks, cooldown: cooldownStep)
        return WorkoutPlan(.custom(custom))
    }

    private static func swimPlan(_ workout: PlannedWorkout.Workout, title: String, openWater: Bool) -> WorkoutPlan? {
        guard CustomWorkout.supportsActivity(.swimming) else { return nil }
        let location: HKWorkoutSessionLocationType = openWater ? .outdoor : .indoor
        let blocks: [IntervalBlock] = (workout.steps ?? []).compactMap { block in
            let steps = (block.steps ?? []).compactMap { s -> IntervalStep? in
                var target = WorkoutStep()
                if s.rest == true {
                    guard !openWater, let seconds = s.durationSeconds, seconds >= 1 else { return nil }
                    target.goal = .time(seconds, .seconds)
                    var step = IntervalStep(.recovery)
                    step.step = target
                    return step
                }
                if !openWater, let meters = s.meters, meters > 0, CustomWorkout.supportsGoal(.distance(meters, .meters), activity: .swimming, location: location) {
                    target.goal = .distance(meters, .meters)
                } else if let seconds = s.durationSeconds, seconds >= 1 {
                    target.goal = .time(seconds, .seconds)
                } else {
                    return nil
                }
                // The drill or the set's cue ("catch-up", "prahové tempo") on the watch.
                if #available(iOS 18.0, *), let note = s.note { target.displayName = String(note.prefix(40)) }
                // From threshold pace (96 % of CSS speed) up a section is work.
                let work = s.intensity.map { $0 == "interval" || $0 == "active" } ?? ((s.percentHigh ?? s.percentLow ?? 0) >= 96)
                var step = IntervalStep(work ? .work : .recovery)
                step.step = target
                return step
            }
            return steps.isEmpty ? nil : IntervalBlock(steps: steps, iterations: max(1, block.repeats ?? 1))
        }
        guard !blocks.isEmpty else { return nil }
        let custom = CustomWorkout(activity: .swimming, location: location, displayName: String(title.prefix(60)), warmup: nil, blocks: blocks, cooldown: nil)
        return WorkoutPlan(.custom(custom))
    }

    private static func step(_ s: PlannedWorkout.Step) -> IntervalStep? {
        guard let target = workoutStep(s) else { return nil }
        // The plan's kind of step; without one, work from tempo up (76 % of FTP or threshold pace).
        let work = s.intensity.map { $0 == "interval" || $0 == "active" } ?? ((s.percentHigh ?? s.percentLow ?? 0) >= 76)
        var step = IntervalStep(work ? .work : .recovery)
        step.step = target
        return step
    }

    private static func workoutStep(_ s: PlannedWorkout.Step) -> WorkoutStep? {
        guard let seconds = s.durationSeconds, seconds >= 1 else { return nil }
        var step = WorkoutStep()
        step.goal = .time(seconds, .seconds)
        if let low = s.wattsLow, let high = s.wattsHigh ?? s.wattsLow, low > 0 {
            step.alert = PowerRangeAlert(target: Measurement(value: low, unit: UnitPower.watts)...Measurement(value: max(low, high), unit: UnitPower.watts))
        } else if let slow = s.paceSlow ?? s.paceFast, let fast = s.paceFast ?? s.paceSlow, slow > 0, fast > 0 {
            // Pace (s/km) as speed: the slower pace is the lower speed.
            let lowSpeed = 1000 / max(slow, fast), highSpeed = 1000 / min(slow, fast)
            step.alert = SpeedRangeAlert(target: Measurement(value: lowSpeed, unit: UnitSpeed.metersPerSecond)...Measurement(value: highSpeed, unit: UnitSpeed.metersPerSecond), metric: .current)
        } else if let low = s.hrLow, let high = s.hrHigh, low > 0, high > low {
            // No FTP or threshold pace: the heart-rate zone the server matched to the step (bpm as Hz).
            step.alert = HeartRateRangeAlert(target: Measurement(value: low / 60, unit: UnitFrequency.hertz)...Measurement(value: high / 60, unit: UnitFrequency.hertz))
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
        VStack(spacing: 12) {
            if let plan {
                Button { showing = true } label: {
                    Label("Do Apple Watch", systemImage: "applewatch")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .workoutPreview(plan, isPresented: $showing)
                TipView(WatchWorkoutTip()).tipBackground(Palette.card)
            }
        }
        .onAppear { plan = WatchWorkout.plan(workout, title: title) }
    }
}
