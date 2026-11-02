import Foundation

/// The sample day on the watch, for the App Store's and the website's
/// screenshots (ios-native.yml, "Screenshot the Apple Watch"): launched with
/// -demo, the watch draws the same Thursday as the iPhone's sample data
/// (Aurin/Data/DemoData.swift) on today's date and never asks the iPhone or
/// the server. -language en|cs picks the language (English without it);
/// -page training|food opens that page, -open sleep|hrv|restingHR|strain a
/// detail, -gym the gym session (with -rest, its rest), -face the watch face.
enum WatchDemo {
    static let on = ProcessInfo.processInfo.arguments.contains("-demo")

    static func value(_ name: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard on, let at = arguments.firstIndex(of: name), at + 1 < arguments.count else { return nil }
        return arguments[at + 1]
    }

    static func flag(_ name: String) -> Bool { on && ProcessInfo.processInfo.arguments.contains(name) }

    private static var english: Bool { value("-language") != "cs" }
    private static func tr(_ czech: String, _ englishText: String) -> String { english ? englishText : czech }

    /// yyyy-MM-dd of today moved by a number of days.
    private static func day(_ offset: Int) -> String {
        WatchStore.localDate(Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date())
    }

    /// The last days of a series, oldest first, ending today.
    private static func series(_ values: [Double]) -> [WatchSnapshot.Day] {
        values.enumerated().map { WatchSnapshot.Day(date: day($0.offset - values.count + 1), value: $0.element) }
    }

    static var snapshot: WatchSnapshot {
        let rhr = (0..<29).map { [53.0, 50, 51, 52][$0 % 4] } + [48]
        let hrv = (0..<29).map { [55.0, 62, 60, 58, 56, 54, 61, 59, 57][$0 % 9] } + [64]
        return WatchSnapshot(
            date: day(0), updated: Date(), language: english ? "en" : "cs", readiness: 78, zone: "green",
            headline: tr("Jak dnes začít", "How to start today"),
            summary: tr("Spánek 7 h 12 min, kousek pod potřebou. HRV je třetí den nad normou.",
                        "Sleep 7 h 12 min, a little under your need. HRV is above normal for the third day."),
            sleep: WatchSnapshot.Sleep(minutes: 432, need: 485, start: "23:33", end: "7:02", deep: 83, rem: 94, light: 255,
                                       nights: series([442, 455, 468, 411, 424, 437, 432])),
            restingHR: WatchSnapshot.Metric(value: 48, low: 49.5, high: 53.5, series: series(rhr)),
            hrv: WatchSnapshot.Metric(value: 64, low: 55, high: 61, series: series(hrv)),
            strain: WatchSnapshot.Strain(score: 8.4, low: 11.4, high: 14.4, training: 5.1, movement: 3.3, planned: 13.1,
                                         nextTitle: tr("Silový trénink", "Strength training"), nextTime: "17:30"),
            steps: 6420,
            week: week,
            food: WatchSnapshot.Food(kcal: 1380, target: 2650,
                                     carbs: WatchSnapshot.Macro(eaten: 177, target: 330),
                                     protein: WatchSnapshot.Macro(eaten: 84, target: 150),
                                     fat: WatchSnapshot.Macro(eaten: 36, target: 80),
                                     water: 1500, waterTarget: 2600),
            alarm: WatchSnapshot.Alarm(work: "07:15", weekend: "08:00", evening: day(0), wake: "07:15", wakeOnce: false,
                                       bedtime: "22:10", inBed: 545, sleep: 510))
    }

    /// The sample week around today: done before it, planned after it, in
    /// all four sports (only the days of this week show on the watch).
    private static var week: [WatchSnapshot.Session] {
        typealias S = WatchSnapshot.Session
        let before: [(String, String, String, Int)] = [
            ("Intervaly 4×8", "Intervals 4×8", "ride", 72),
            ("Plavání 2 km", "Swim 2 km", "swim", 45),
            ("Běh", "Run", "run", 54),
            ("Kolo", "Ride", "ride", 60),
            ("Posilovna · horní tělo", "Gym · upper body", "strength", 50),
            ("Lehký běh", "Easy run", "run", 40)]
        let after: [(String, String, String, Int)] = [
            ("Lehká jízda Z2", "Easy ride Z2", "ride", 72),
            ("Dlouhý běh", "Long run", "run", 96),
            ("Plavání, technika", "Swim technique", "swim", 45),
            ("Regenerace", "Recovery", "ride", 30),
            ("Posilovna · dolní tělo", "Gym · lower body", "strength", 50),
            ("Dlouhá jízda", "Long ride", "ride", 150)]
        var sessions = before.enumerated().reversed().map {
            S(date: day(-$0.offset - 1), time: nil, title: tr($0.element.0, $0.element.1), sport: $0.element.2, minutes: $0.element.3, done: true)
        }
        sessions.append(S(date: day(0), time: "07:30", title: tr("Ranní běh", "Morning run"), sport: "run", minutes: 42, done: true))
        sessions.append(S(date: day(0), time: "17:30", title: tr("Silový trénink, celé tělo", "Strength, full body"), sport: "strength", minutes: 45, done: false))
        sessions += after.enumerated().map {
            S(date: day($0.offset + 1), time: nil, title: tr($0.element.0, $0.element.1), sport: $0.element.2, minutes: $0.element.3, done: false)
        }
        return sessions
    }

    /// Today's gym (the iPhone's sample sheet, DemoData.gymJSON): the squat's
    /// warm-up and first set done, the second next.
    static var gym: WatchGym {
        typealias L = WatchGym.Lift
        let squat = tr("Dřep", "Squat")
        let bench = tr("Tlak na lavici", "Bench press")
        let rows = tr("Přítahy v předklonu", "Bent-over rows")
        return WatchGym(
            date: day(0), title: tr("Celé tělo", "Full body"), minutes: 45, restExercises: 120,
            exercises: [
                WatchGym.Exercise(name: "Dřep", shown: squat, lifts: [
                    L(row: 7, number: "1", warmup: true, drop: false, kg: 40, reps: 8, plannedReps: "8", done: true, rest: 60),
                    L(row: 8, number: "1", warmup: false, drop: false, kg: 80, reps: 8, plannedReps: "6-8", done: true, rest: 150, intensity: "M"),
                    L(row: 9, number: "2", warmup: false, drop: false, kg: 80, reps: 8, plannedReps: "6-8", done: false, rest: 150),
                    L(row: 10, number: "3", warmup: false, drop: false, kg: 80, reps: 8, plannedReps: "6-8", done: false, rest: 150)]),
                WatchGym.Exercise(name: "Tlak na lavici", shown: bench, lifts: [
                    L(row: 11, number: "1", warmup: false, drop: false, kg: 62.5, reps: 8, plannedReps: "8-10", done: false, rest: 90),
                    L(row: 12, number: "2", warmup: false, drop: false, kg: 62.5, reps: 8, plannedReps: "8-10", done: false, rest: 90)]),
                WatchGym.Exercise(name: "Přítahy v předklonu", shown: rows, lifts: [
                    L(row: 13, number: "1", warmup: false, drop: false, kg: 50, reps: 10, plannedReps: "10", done: false, rest: 90),
                    L(row: 14, number: "2", warmup: false, drop: false, kg: 50, reps: 10, plannedReps: "10", done: false, rest: 90)])])
    }
}
