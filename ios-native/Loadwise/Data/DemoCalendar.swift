import Foundation

// The sample training calendar: six weeks back and two ahead of the sample day.
extension DemoData {
    static let calendarByDate: [String: CalendarDay] = Dictionary(uniqueKeysWithValues: calendar(around: training.date).map { ($0.date, $0) })

    static func calendar(around today: String) -> [CalendarDay] {
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
            let done = date <= today
            // Every fifth week a lighter one; a few days off now and then.
            let skip = (Int(date.suffix(2)) ?? 0) % 11 == 0
            let items = skip ? [] : week[ISODay.weekdayIndex(date)]
            let list: [CalendarActivity] = items.enumerated().compactMap { i, item -> CalendarActivity? in
                if !done && item.0 == "walk" { return nil }
                return CalendarActivity(id: date + "-\(i)", sport: item.0, status: done ? "done" : "planned", title: item.1, date: date,
                                        time: i == 0 ? "07:30" : "17:10", minutes: item.2, km: item.3, kcal: done ? item.4 : nil,
                                        activityId: nil, eventId: nil)
            }
            let real = list.filter { $0.status == "done" }
            let main = list.filter { $0.sport != "walk" }.max { ($0.minutes ?? 0) < ($1.minutes ?? 0) } ?? list.first
            return CalendarDay(date: date, primary: main?.sport ?? "rest", count: real.count,
                               minutes: real.reduce(0) { $0 + ($1.minutes ?? 0) }, kcal: real.reduce(0) { $0 + ($1.kcal ?? 0) },
                               planned: list.count - real.count, activities: list)
        }
    }
}
