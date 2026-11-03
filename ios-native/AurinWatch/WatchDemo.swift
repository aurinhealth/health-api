import Foundation

/// The sample day on the watch, for the App Store's and the website's
/// screenshots (ios-native.yml, "Screenshot the Apple Watch"): launched with
/// -demo, the watch draws the same Thursday as the iPhone's sample data
/// (Aurin/Data/DemoData.swift) on this week's Thursday and never asks the iPhone or
/// the server. -language en|cs picks the language (English without it);
/// -page training|food opens that page (training with -week scrolled to its week), -open sleep|hrv|restingHR|strain a
/// detail, -gym the gym session (with -rest, its rest), -face the watch face.
enum WatchDemo {
    static let on = ProcessInfo.processInfo.arguments.contains("-demo")

    static func value(_ name: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard on, let at = arguments.firstIndex(of: name), at + 1 < arguments.count else { return nil }
        return arguments[at + 1]
    }

    static func flag(_ name: String) -> Bool { on && ProcessInfo.processInfo.arguments.contains(name) }

    /// Now, for the pages that ask what day it is: in the sample day, this
    /// week's Thursday at 10:09 (the iPhone's sample day is a Thursday, and the
    /// week then shows done days and planned days), otherwise the real time.
    static var now: Date { on ? sampleNow : Date() }

    private static let sampleNow: Date = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        let monday = calendar.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        let thursday = calendar.date(byAdding: .day, value: 3, to: monday) ?? Date()
        return calendar.date(bySettingHour: 10, minute: 9, second: 0, of: thursday) ?? Date()
    }()

    private static var english: Bool { value("-language") != "cs" }
    private static func tr(_ czech: String, _ englishText: String) -> String { english ? englishText : czech }

    /// yyyy-MM-dd of the sample day moved by a number of days.
    private static func day(_ offset: Int) -> String {
        WatchStore.localDate(Calendar.current.date(byAdding: .day, value: offset, to: now) ?? now)
    }

    /// The last days of a series, oldest first, ending today.
    private static func series(_ values: [Double]) -> [WatchSnapshot.Day] {
        values.enumerated().map { WatchSnapshot.Day(date: day($0.offset - values.count + 1), value: $0.element) }
    }

    static var snapshot: WatchSnapshot {
        let rhr = (0..<29).map { [53.0, 50, 51, 52][$0 % 4] } + [48]
        let hrv = (0..<29).map { [55.0, 62, 60, 58, 56, 54, 61, 59, 57][$0 % 9] } + [64]
        return WatchSnapshot(
            date: day(0), updated: now, language: english ? "en" : "cs", readiness: 78, zone: "green",
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
        func sets(_ first: Int, _ count: Int, _ kg: Double, _ reps: Int, _ planned: String, rest: Int) -> [L] {
            (0..<count).map { L(row: first + $0, number: String($0 + 1), warmup: false, drop: false, kg: kg, reps: reps,
                                plannedReps: planned, done: false, rest: rest) }
        }
        var squat = [L(row: 7, number: "1", warmup: true, drop: false, kg: 40, reps: 8, plannedReps: "8", done: true, rest: 60)]
        squat += sets(8, 4, 80, 8, "6-8", rest: 150)
        squat[1].done = true
        squat[1].intensity = "M"
        return WatchGym(
            date: day(0), title: tr("Celé tělo", "Full body"), minutes: 45, restExercises: 120,
            exercises: [
                WatchGym.Exercise(name: "Dřep", shown: tr("Dřep", "Squat"), lifts: squat),
                WatchGym.Exercise(name: "Tlak na lavici", shown: tr("Tlak na lavici", "Bench press"), lifts: sets(12, 3, 62.5, 8, "8", rest: 90)),
                WatchGym.Exercise(name: "Přítahy", shown: tr("Přítahy", "Rows"), lifts: sets(15, 3, 50, 10, "10", rest: 90)),
                WatchGym.Exercise(name: "Rumunský mrtvý tah", shown: tr("Rumunský mrtvý tah", "Romanian deadlift"), lifts: sets(18, 3, 70, 8, "8", rest: 120)),
                WatchGym.Exercise(name: "Výpady", shown: tr("Výpady", "Lunges"), lifts: sets(21, 3, 16, 10, "10", rest: 90))])
    }
}
