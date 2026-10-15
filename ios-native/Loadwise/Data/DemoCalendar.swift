import Foundation

// The sample training calendar: six weeks back and two ahead of the sample day.
extension DemoData {
    static var calendarByDate: [String: CalendarDay] { L10n.isEnglish ? calendarEnglish : calendarCzech }
    private static let calendarCzech = Dictionary(uniqueKeysWithValues: calendar(around: training.date, english: false).map { ($0.date, $0) })
    private static let calendarEnglish = Dictionary(uniqueKeysWithValues: calendar(around: training.date, english: true).map { ($0.date, $0) })

    static func calendar(around today: String, english: Bool = L10n.isEnglish) -> [CalendarDay] {
        // Per weekday (Monday first): what a usual week holds.
        let week: [[(String, String, Double, Double?, Double)]] = [
            [("strength", "Posilovna · horní tělo", 55, nil, 320)],
            [("ride", "Sweet spot 3×12", 75, 38.5, 820), ("walk", "Chůze", 30, 2.6, 140)],
            [("run", "Lehký běh", 45, 8.1, 560)],
            [("strength", "Posilovna · dolní tělo", 60, nil, 360), ("walk", "Chůze", 25, 2.1, 110)],
            [],
            [("ride", "Dlouhá jízda", 180, 92, 2100)],
            [("walk", "Procházka", 70, 5.8, 290)]
        ]
        return ISODay.range(ISODay.shift(today, -42), ISODay.shift(today, 14)).map { (date: String) -> CalendarDay in
            // Every fifth week a lighter one; a few days off now and then.
            let skip = (Int(date.suffix(2)) ?? 0) % 11 == 0
            // The sample day itself: the morning walk done, the strength session of
            // Today's plan (DemoData.training.next) still ahead at 17:30.
            let items: [(String, String, Double, Double?, Double)] = date == today ? [("walk", "Chůze", 25, 2.1, 110), ("strength", "Silový trénink, celé tělo", 45, nil, 0)]
                : skip ? [] : week[ISODay.weekdayIndex(date)]
            // Now and then a session done differently from the plan.
            let differently = (Int(date.suffix(2)) ?? 0) % 9 == 4
            let list: [CalendarActivity] = items.enumerated().compactMap { i, item -> CalendarActivity? in
                let done = date < today || (date == today && item.0 == "walk")
                if !done && item.0 == "walk" { return nil }
                let adherence: String? = !done ? nil : item.0 == "walk" ? "offplan" : differently ? "off" : "good"
                let time = date == today && !done ? "17:30" : i == 0 ? "07:30" : "17:10"
                return CalendarActivity(id: date + "-\(i)", sport: item.0, status: done ? "done" : "planned", title: english ? Self.english[item.1] ?? item.1 : item.1, date: date,
                                        time: time, minutes: item.2, km: item.3, kcal: done ? item.4 : nil,
                                        activityId: nil, eventId: nil, adherence: adherence)
            }
            let real = list.filter { $0.status == "done" }
            let main = list.filter { $0.sport != "walk" }.max { ($0.minutes ?? 0) < ($1.minutes ?? 0) } ?? list.first
            // The day's state as src/app-training.js dayPlanState orders it.
            let states: [String] = list.map { $0.adherence ?? "planned" }
            let plan: String? = ["off", "good", "planned", "offplan"].first(where: { states.contains($0) })
            return CalendarDay(date: date, primary: main?.sport ?? "rest", count: real.count,
                               minutes: real.reduce(0) { $0 + ($1.minutes ?? 0) }, kcal: real.reduce(0) { $0 + ($1.kcal ?? 0) },
                               planned: list.count - real.count, activities: list, plan: plan)
        }
    }
}
