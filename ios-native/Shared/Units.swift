import Foundation

/// Settings → Jednotky: metric or imperial. The server and the gym sheet keep
/// metric values; only what is shown and typed in is converted here.
enum Units {
    static let key = "units"

    static var imperial: Bool {
        (UserDefaults(suiteName: WidgetSnapshot.group)?.string(forKey: key)
            ?? UserDefaults.standard.string(forKey: key)) == "imperial"
    }

    static func setSystem(_ value: String) {
        UserDefaults.standard.set(value, forKey: key)
        UserDefaults(suiteName: WidgetSnapshot.group)?.set(value, forKey: key)
    }

    private static let poundsPerKg = 2.2046226218
    private static let milesPerKm = 0.6213711922
    private static let mlPerFluidOunce = 29.5735295625
    private static let cmPerInch = 2.54

    // MARK: Weight (body weight, lifted weight, weekly goals)

    static var weightUnit: String { imperial ? "lb" : "kg" }
    static func weight(_ kg: Double) -> Double { imperial ? kg * poundsPerKg : kg }
    static func kg(_ shown: Double) -> Double { imperial ? shown / poundsPerKg : shown }
    /// The −/+ step for a barbell or dumbbell: 2.5 kg or 5 lb.
    static var weightStep: Double { imperial ? 5 : 2.5 }

    // MARK: Distance and pace

    static var distanceUnit: String { imperial ? "mi" : "km" }
    static func distance(_ km: Double) -> Double { imperial ? km * milesPerKm : km }
    static var paceUnit: String { imperial ? "/mi" : "/km" }
    /// Seconds per km → seconds per mile.
    static func pace(_ secondsPerKm: Double) -> Double { imperial ? secondsPerKm / milesPerKm : secondsPerKm }

    // MARK: Body length (height, waist)

    static var lengthUnit: String { imperial ? "in" : "cm" }
    static func length(_ cm: Double) -> Double { imperial ? cm / cmPerInch : cm }
    static func cm(_ shown: Double) -> Double { imperial ? shown * cmPerInch : shown }

    // MARK: Drinks

    static var volumeUnit: String { imperial ? "fl oz" : "ml" }
    static func volume(_ ml: Double) -> Double { imperial ? ml / mlPerFluidOunce : ml }
    static func ml(_ shown: Double) -> Double { imperial ? shown * mlPerFluidOunce : shown }
    /// Water in a glass as people say it: 250 ml or 8 fl oz.
    static func roundedMl(fluidOunces: Double) -> Int { Int((fluidOunces * mlPerFluidOunce).rounded()) }

    // MARK: Temperature

    static var temperatureUnit: String { imperial ? "°F" : "°C" }
    static func temperature(_ celsius: Double) -> Double { imperial ? celsius * 9 / 5 + 32 : celsius }
    /// A change of temperature (a deviation from the usual), not a reading.
    static func temperatureChange(_ celsius: Double) -> Double { imperial ? celsius * 9 / 5 : celsius }

    // MARK: Text

    private static func number(_ v: Double, digits: Int) -> String {
        v.formatted(.number.precision(.fractionLength(digits)).locale(L10n.locale))
    }

    /// "82,4 kg" or "181.7 lb".
    static func weightText(_ kg: Double?, digits: Int = 1) -> String {
        guard let kg else { return "–" }
        return number(weight(kg), digits: digits) + " " + weightUnit
    }

    /// "12,3 km" or "7.6 mi".
    static func distanceText(_ km: Double?, digits: Int = 1) -> String {
        guard let km else { return "–" }
        return number(distance(km), digits: digits) + " " + distanceUnit
    }

    /// "500 ml" or "16.9 fl oz".
    static func volumeText(_ ml: Double?) -> String {
        guard let ml else { return "–" }
        return number(volume(ml), digits: imperial ? 1 : 0) + " " + volumeUnit
    }

    /// "180 cm" or "70.9 in".
    static func lengthText(_ cm: Double?, digits: Int = 0) -> String {
        guard let cm else { return "–" }
        return number(length(cm), digits: imperial ? 1 : digits) + " " + lengthUnit
    }

    /// "36,6 °C" or "97.9 °F".
    static func temperatureText(_ celsius: Double?, digits: Int = 1) -> String {
        guard let celsius else { return "–" }
        return number(temperature(celsius), digits: digits) + " " + temperatureUnit
    }

    /// "5:12 /km" or "8:22 /mi".
    static func paceText(_ secondsPerKm: Double?) -> String {
        guard let secondsPerKm, secondsPerKm > 0 else { return "–" }
        let s = Int(pace(secondsPerKm).rounded())
        return "\(s / 60):" + String(format: "%02d", s % 60) + " " + paceUnit
    }
}
