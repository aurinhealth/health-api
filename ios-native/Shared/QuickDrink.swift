import AppIntents
import Foundation
import WidgetKit

/// Water added from the home-screen widget. The widget has no session of its
/// own, so the drink waits in the App Group; the app moves it into its outbox
/// of writes on the next refresh (AppModel.sendOutbox), which sends it when
/// there is signal. The widget shows it at once.
enum PendingDrinks {
    struct Drink: Codable, Equatable {
        let date: String
        let ml: Int
    }

    private static let key = "pendingDrinks"

    static func add(_ ml: Int, on date: String) {
        let defaults = UserDefaults(suiteName: WidgetSnapshot.group)
        var list = load(defaults)
        list.append(Drink(date: date, ml: ml))
        defaults?.set(try? JSONEncoder().encode(list), forKey: key)
    }

    /// The waiting drinks, removed from the queue (put back what fails to send).
    static func take() -> [Drink] {
        let defaults = UserDefaults(suiteName: WidgetSnapshot.group)
        let list = load(defaults)
        defaults?.removeObject(forKey: key)
        return list
    }

    static func putBack(_ drinks: [Drink]) {
        for d in drinks { add(d.ml, on: d.date) }
    }

    private static func load(_ defaults: UserDefaults?) -> [Drink] {
        guard let data = defaults?.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Drink].self, from: data)) ?? []
    }

    static func localDate(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

struct AddWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Přidat vodu"
    static var description = IntentDescription("Zapíše sklenici vody do dnešního pití.")

    @Parameter(title: "Množství (ml)", default: 250)
    var ml: Int

    init() {}

    init(ml: Int) {
        self.ml = ml
    }

    func perform() async throws -> some IntentResult {
        let today = PendingDrinks.localDate()
        PendingDrinks.add(ml, on: today)
        // After midnight the old day's snapshot starts the new day at zero water.
        if let saved = WidgetSnapshot.load() {
            var snapshot = saved.current(today: today)
            snapshot.waterMl = (snapshot.waterMl ?? 0) + Double(ml)
            snapshot.save()
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
