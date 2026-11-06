import Foundation
import WidgetKit

/// Hands Today to the home-screen widgets (AurinWidgets) via the App Group,
/// to the menu on the app's icon (QuickActions) and to the Apple Watch (WatchBridge).
enum WidgetBridge {
    static func update(_ today: TodaySnapshot) {
        let next = today.plan.first { $0.kind == "workout" && !$0.done }
        let snapshot = WidgetSnapshot(date: today.date, updated: Date(), readiness: today.readiness.score, zone: today.readiness.zone,
                                      sleepMinutes: today.sleep?.minutes, sleepIndex: today.sleep?.index,
                                      strain: today.strain.score, strainPlanned: today.strain.planned, hrv: today.hrv?.value,
                                      kcal: today.nutrition.kcal, kcalTarget: today.nutrition.target,
                                      waterMl: today.nutrition.water.ml, waterTarget: today.nutrition.water.target,
                                      protein: today.nutrition.protein.eaten, proteinTarget: today.nutrition.protein.target,
                                      carbs: today.nutrition.carbs.eaten, carbsTarget: today.nutrition.carbs.target,
                                      fat: today.nutrition.fat.eaten, fatTarget: today.nutrition.fat.target,
                                      steps: today.steps.today, stepsGoal: today.steps.goal,
                                      bedtime: today.tonight?.bedtime, nextTitle: next?.title, nextTime: next?.time,
                                      hrvLow: today.hrv?.low, hrvHigh: today.hrv?.high,
                                      restingHR: today.restingHR?.value, restingLow: today.restingHR?.low, restingHigh: today.restingHR?.high,
                                      nextSport: next?.sport, nextMinutes: next?.session?.minutes,
                                      weekZones: today.week.map { days in Dictionary(days.compactMap { d in d.zone.map { (d.date, $0) } }, uniquingKeysWith: { a, _ in a }) },
                                      hrvSeries: today.hrv.map { Array($0.series.suffix(7).map(\.value)) },
                                      restingSeries: today.restingHR.map { Array($0.series.suffix(7).map(\.value)) })
        // The same day again (a refresh with nothing new) keeps the new time,
        // but redraws the widgets only when they may show "před 3 h" by now:
        // reloads are budgeted.
        let saved = WidgetSnapshot.load()
        var same = saved
        same?.updated = snapshot.updated
        snapshot.save()
        if same != snapshot || saved?.hoursOld(at: snapshot.updated) != nil {
            WidgetCenter.shared.reloadAllTimelines()
        }
        Task { @MainActor in
            QuickActions.update(today)
            WatchBridge.shared.update(today)
        }
    }

    /// Training's week for the large widget, and its sessions ahead for
    /// Spotlight (AurinSpotlight.swift).
    static func update(training: TrainingSnapshot) {
        let sessions = training.sessions ?? []
        let monday = AppModel.monday(of: training.date)
        let days = (0..<7).compactMap { AppModel.shift(monday, by: $0) }.map { date in
            WidgetWeek.Day(date: date, minutes: Double(sessions.filter { $0.date == date && $0.status == "done" }.compactMap(\.minutes).reduce(0, +)),
                           planned: Double(sessions.filter { $0.date == date && $0.status == "planned" }.compactMap(\.minutes).reduce(0, +)))
        }
        let ahead = sessions.filter { $0.status == "planned" && $0.date >= training.date }
            .sorted { ($0.date, $0.time ?? "99") < ($1.date, $1.time ?? "99") }
        let done = sessions.filter { $0.status == "done" && $0.plannedId != nil }.count
        let week = WidgetWeek(days: days, minutes: days.reduce(0) { $0 + $1.minutes }, done: done,
                              planned: done + sessions.filter { $0.status == "planned" || $0.status == "missed" }.count,
                              next: ahead.prefix(3).map { WidgetWeek.Session(title: $0.title, sport: $0.sport, date: $0.date, time: $0.time) })
        if week.save() { WidgetCenter.shared.reloadTimelines(ofKind: "week") }
        AurinSpotlight.index(ahead)
    }

    /// The week for the large widget when Today shows the saved one is out of
    /// date: a new week (Monday), or today's workouts differ from it (one done,
    /// added or moved). Before, it waited for a visit to Training and asked to
    /// open the app all Monday. Training loads only then, once for the same Today.
    @MainActor
    static func followWeek(_ today: TodaySnapshot, api: APIClient) async {
        let sessions = today.plan.compactMap(\.session)
        func minutes(_ status: String) -> Double { Double(sessions.filter { $0.status == status }.compactMap(\.minutes).reduce(0, +)) }
        let day = WidgetWeek.load()?.days.first { $0.date == today.date }
        if let day, day.minutes == minutes("done"), day.planned == minutes("planned") { return }
        let mark = [today.date, String(minutes("done")), String(minutes("planned"))].joined(separator: "|")
        guard mark != followed, let training = try? await api.training(), !Task.isCancelled else { return }
        followed = mark
        update(training: training)
    }
    @MainActor private static var followed: String?

    /// Redraws the widgets in a new language or new units.
    static func reload() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func clear() {
        WidgetSnapshot.clear()
        WidgetWeek.clear()
        AurinSpotlight.clear()
        WidgetCenter.shared.reloadAllTimelines()
        Task { @MainActor in
            QuickActions.clear()
            WatchBridge.shared.clear()
        }
    }
}
