import AppIntents
import ActivityKit
import Foundation
import WidgetKit

/// Water added from the home-screen widget. The widget has no session of its
/// own, so the drink waits in the App Group; the app moves it into its outbox
/// of writes on the next refresh (WriteQueue.send), which sends it when
/// there is signal. The widget shows it at once. Each drink keeps the account
/// signed in when it was added, so another account never sends it.
enum PendingDrinks {
    struct Drink: Codable, Equatable {
        let date: String
        let ml: Int
        var account: Int? = nil
    }

    private static let key = "pendingDrinks"
    private static let accountKey = "pendingDrinksAccount"

    /// The account signed in in the app (its id), for the widget and Siri;
    /// nil after "Odhlásit se".
    static var account: Int? {
        get { UserDefaults(suiteName: WidgetSnapshot.group)?.object(forKey: accountKey) as? Int }
        set { UserDefaults(suiteName: WidgetSnapshot.group)?.set(newValue, forKey: accountKey) }
    }
    /// The app's send of its outbox (AppModel sets it): an intent run in the
    /// app's process (Siri, the Voda control) sends the drink before it returns.
    /// nil in the widget extension, where the drink waits for the app.
    @MainActor static var sendNow: (@MainActor () async -> Void)?

    /// A drink from an intent: queued, counted in the widget's snapshot and the
    /// Voda control at once, and sent when the app's process runs it.
    @MainActor
    static func record(_ ml: Int) async {
        let today = localDate()
        add(ml, on: today)
        // After midnight the old day's snapshot starts the new day at zero water.
        if let saved = WidgetSnapshot.load() {
            var snapshot = saved.current(today: today)
            snapshot.waterMl = (snapshot.waterMl ?? 0) + Double(ml)
            snapshot.save()
        }
        WidgetCenter.shared.reloadAllTimelines()
        AurinControls.reload(AurinControls.water)
        await sendNow?()
    }

    /// The user's glass of water: the smallest amount saved for water in Jídlo →
    /// Pití (DrinkPrefs, the app's own defaults), else 250 ml or 8 fl oz.
    static var glassMl: Int {
        glassMl(saved: UserDefaults.standard.string(forKey: "drinkAmounts.water"), imperial: Units.imperial)
    }

    static func glassMl(saved: String?, imperial: Bool) -> Int {
        if let smallest = saved?.split(separator: ",").compactMap({ Int($0) }).filter({ $0 > 0 }).min() { return smallest }
        return imperial ? Units.roundedMl(fluidOunces: 8) : 250
    }

    static func add(_ ml: Int, on date: String, account: Int? = PendingDrinks.account) {
        let defaults = UserDefaults(suiteName: WidgetSnapshot.group)
        var list = load(defaults)
        list.append(Drink(date: date, ml: ml, account: account))
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
        for d in drinks { add(d.ml, on: d.date, account: d.account) }
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
    /// On a locked phone (Siri, the Lock Screen's controls) Face ID or the passcode first.
    static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    /// Millilitres; the title names no unit because an intent's texts are fixed at build time.
    @Parameter(title: "Množství")
    var ml: Int?

    init() {}

    init(ml: Int) {
        self.ml = ml
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ml = min(max(self.ml ?? PendingDrinks.glassMl, 1), 3000)
        await PendingDrinks.record(ml)
        return .result(dialog: IntentDialog("\(L10n.f("Zapsáno %@ vody.", Units.volumeText(Double(ml))))"))
    }
}

/// Voda in Control Center and on the Lock Screen, also on an Apple Watch
/// (watchOS 26 shows the iPhone's controls): the user's glass, as
/// AddWaterIntent. A Live Activity intent runs in the app's process (iOS
/// starts it in the background), not in the widget extension, so the glass
/// goes to the server at once instead of waiting for the app's next open, and
/// the control shows the new total.
struct WaterControlIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Zapsat vodu"
    static let isDiscoverable = false
    static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    func perform() async throws -> some IntentResult {
        await PendingDrinks.record(PendingDrinks.glassMl)
        return .result()
    }
}
