import Foundation
import WidgetKit

/// Hands Today to the home-screen widgets (LoadwiseWidgets) via the App Group.
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
                                      bedtime: today.tonight?.bedtime, nextTitle: next?.title, nextTime: next?.time)
        snapshot.save()
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func clear() {
        WidgetSnapshot.clear()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
