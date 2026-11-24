import Foundation

/// The day's goals as one set: calories (with what training adds), the
/// macros and drinks. Today and Food both bring them, from the same server
/// computation but at different times (the energy budget moves with the day's
/// movement), so two screens showed two targets (617 #3: 2,299 on Today,
/// 2,410 on Food, 1.6 l against 1.9 l in Goals). Every screen reads them here:
/// the newer answer of the day wins.
struct DayGoals: Equatable {
    let kcal: Double?
    let trainingBonus: Double?
    let carbs: Double?
    let carbsLimit: Bool
    let protein: Double?
    let fat: Double?
    let waterMl: Double?

    init(today: TodaySnapshot) {
        let n = today.nutrition
        kcal = n.target
        trainingBonus = n.trainingBonus
        carbs = n.carbs.target
        carbsLimit = n.carbs.limit == true
        protein = n.protein.target
        fat = n.fat.target
        waterMl = n.water.target
    }

    init(food: FoodSnapshot) {
        kcal = food.target
        trainingBonus = food.trainingBonus
        carbs = food.macros.carbs.target
        carbsLimit = food.macros.carbs.limit == true
        protein = food.macros.protein.target
        fat = food.macros.fat.target
        waterMl = food.water.target
    }

    /// Whole kcal, grams and ml: what the screens show.
    var shown: [Double?] { [kcal, trainingBonus, carbs, protein, fat, waterMl].map { $0.map { $0.rounded() } } }
}

extension AppModel {
    /// The goals of `day` as the phone has them: from Today or Food, the newer
    /// one when both hold that day. Nil when neither does.
    func goals(on day: String) -> DayGoals? {
        let fromToday = today.flatMap { $0.date == day ? DayGoals(today: $0) : nil }
        let fromFood = food.flatMap { $0.date == day ? DayGoals(food: $0) : nil }
        guard let fromToday, let fromFood else { return fromToday ?? fromFood }
        let todayAt = fetched[.today].flatMap { $0.day == day ? $0.at : nil } ?? .distantPast
        let foodAt = fetched[.food].flatMap { $0.day == day ? $0.at : nil } ?? .distantPast
        return foodAt > todayAt ? fromFood : fromToday
    }

    /// Today's goals for Settings, whichever day the screens show: in memory,
    /// else today's copy saved on the phone (settingsToday).
    var todayGoals: DayGoals? {
        goals(on: Self.localDate(Date())) ?? settingsToday.map(DayGoals.init(today:))
    }

    /// Today brought other goals than Food holds for the same day: Food loads
    /// again, so its target, parts and meal targets match (its parts must add
    /// up to its own target, so Food never mixes in Today's number).
    func foodGoalsBehind(_ snapshot: TodaySnapshot) -> Bool {
        guard let food, food.date == snapshot.date else { return false }
        return DayGoals(food: food).shown != DayGoals(today: snapshot).shown
    }
}

extension TodaySnapshot.Nutrition {
    /// The same eaten numbers against the day's one set of goals.
    func with(_ goals: DayGoals?) -> Self {
        guard let goals else { return self }
        return Self(kcal: kcal, target: goals.kcal, autoTarget: autoTarget, trainingBonus: goals.trainingBonus,
                    protein: .init(eaten: protein.eaten, target: goals.protein, limit: protein.limit),
                    carbs: .init(eaten: carbs.eaten, target: goals.carbs, limit: goals.carbsLimit ? true : carbs.limit),
                    fat: .init(eaten: fat.eaten, target: goals.fat, limit: fat.limit),
                    water: .init(ml: water.ml, target: goals.waterMl, autoTarget: water.autoTarget, mode: water.mode, build: water.build))
    }
}
