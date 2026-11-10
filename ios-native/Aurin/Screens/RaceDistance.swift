import SwiftUI

/// The main race's distance (onboarding review point 2): a common race, or a
/// sport and a distance of one's own. The server sets the weeks of build and
/// the taper by it (src/athlete-focus.js raceClass) and drops a distance no
/// race has; without one it keeps 12 weeks and a week of taper.
struct RaceDistance: Equatable {
    /// run, ride, swim or tri; empty when no distance is given.
    var sport = ""
    var km: Double?

    static let presets: [(id: String, label: String, sport: String, km: Double)] = [
        ("run5", "5 km", "run", 5), ("run10", "10 km", "run", 10), ("half", "Půlmaraton", "run", 21.1), ("marathon", "Maraton", "run", 42.2),
        ("sprint", "Triatlon sprint", "tri", 25.75), ("olympic", "Olympijský triatlon", "tri", 51.5),
        ("half-ironman", "Ironman 70.3", "tri", 113), ("ironman", "Ironman", "tri", 226)
    ]
    static let sports = [("run", "Běh"), ("ride", "Kolo"), ("swim", "Plavání"), ("tri", "Triatlon")]

    init() {}

    init(profile: JSONObject) {
        sport = profile["eventSport"]?.string ?? ""
        km = profile["eventKm"]?.number
    }

    /// The preset this is, "own" for any other distance, "" when none is given.
    var choice: String {
        guard !sport.isEmpty else { return "" }
        return Self.presets.first { $0.sport == sport && abs($0.km - (km ?? -1)) < 0.05 }?.id ?? "own"
    }

    mutating func choose(_ id: String) {
        if let preset = Self.presets.first(where: { $0.id == id }) {
            sport = preset.sport
            km = preset.km
        } else if id == "own" {
            // From a common race: the same sport, the distance to type.
            guard choice != "own" else { return }
            if sport.isEmpty { sport = "run" }
            km = nil
        } else {
            sport = ""
            km = nil
        }
    }

    /// The profile with the distance; both fields empty clear it on the server.
    func applied(to profile: JSONObject) -> JSONObject {
        var next = profile
        let given = !sport.isEmpty && (km ?? 0) > 0
        next["eventSport"] = .string(given ? sport : "")
        next["eventKm"] = given ? .number(km ?? 0) : .null
        return next
    }
}

/// "Vzdálenost" under the race's name and day; "Jiná vzdálenost" adds the
/// sport and the distance in km (miles with imperial units).
struct RaceDistanceRows: View {
    @Binding var distance: RaceDistance
    @State private var typed = ""

    private var options: [(String, String)] {
        [("", L10n.tr("nevybráno"))] + RaceDistance.presets.map { ($0.id, L10n.tr($0.label)) } + [("own", L10n.tr("Jiná vzdálenost"))]
    }

    var body: some View {
        SettingsPicker(title: "Vzdálenost", selection: Binding(get: { distance.choice }, set: { distance.choose($0); typed = shown }), options: options)
        if distance.choice == "own" {
            SettingsDivider()
            SettingsPicker(title: "Sport", selection: $distance.sport, options: RaceDistance.sports.map { ($0.0, L10n.tr($0.1)) })
            SettingsDivider()
            SettingsField(title: "Délka", text: Binding(get: { typed }, set: { text in
                typed = text
                let value = JSONValue.field(text).number
                distance.km = value.map { $0 / Units.distance(1) }
            }), unit: Units.distanceUnit)
            .onAppear { typed = shown }
        }
    }

    /// The saved distance in the shown unit, empty when there is none.
    private var shown: String {
        guard let km = distance.km else { return "" }
        let value = Units.distance(km)
        return Fmt.decimal(value, digits: value.rounded() == value ? 0 : 1)
    }
}
