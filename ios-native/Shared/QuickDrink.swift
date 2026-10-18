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
    /// Posted after a drink is added; the app, when it runs (Siri), sends it at once.
    static let added = Notification.Name("PendingDrinks.added")

    /// The user's glass of water: the smallest amount saved for water in Jídlo →
    /// Pití (DrinkPrefs, the app's own defaults), else 250 ml or 8 fl oz.
    static var glassMl: Int {
        glassMl(saved: UserDefaults.standard.string(forKey: "drinkAmounts.water"), imperial: Units.imperial)
    }

    static func glassMl(saved: String?, imperial: Bool) -> Int {
        if let smallest = saved?.split(separator: ",").compactMap({ Int($0) }).filter({ $0 > 0 }).min() { return smallest }
        return imperial ? Units.roundedMl(fluidOunces: 8) : 250
    }

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

/// The widget's water buttons, and "Zapsat vodu" in Siri and Shortcuts
/// (AurinShortcuts), where the amount may be left out for the user's glass.
struct AddWaterIntent: AppIntent {
    static let title: LocalizedStringResource = "Zapsat vodu"
    static let description = IntentDescription("Zapíše vodu do dnešního pití.")

    /// Millilitres; the title names no unit because an intent's texts are fixed at build time.
    @Parameter(title: "Množství")
    var ml: Int?

    init() {}

    init(ml: Int) {
        self.ml = ml
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ml = min(max(self.ml ?? PendingDrinks.glassMl, 1), 3000)
        let today = PendingDrinks.localDate()
        PendingDrinks.add(ml, on: today)
        // After midnight the old day's snapshot starts the new day at zero water.
        if let saved = WidgetSnapshot.load() {
            var snapshot = saved.current(today: today)
            snapshot.waterMl = (snapshot.waterMl ?? 0) + Double(ml)
            snapshot.save()
        }
        WidgetCenter.shared.reloadAllTimelines()
        NotificationCenter.default.post(name: PendingDrinks.added, object: nil)
        return .result(dialog: IntentDialog("\(L10n.f("Zapsáno %@ vody.", Units.volumeText(Double(ml))))"))
    }
}
