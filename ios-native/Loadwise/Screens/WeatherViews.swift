import SwiftUI
import CoreLocation

// Weather on Today: the forecast for the place of the week plan
// (GET /app/api/today → weather, src/app-today.js todayWeather) with the
// coach's advice where to train, and "Poloha pro počasí" to choose the place
// (Open-Meteo geocoding, saved as prefs.location of the usual week plan).

/// Texts and symbols for Open-Meteo's forecast (WMO weather codes).
enum WeatherText {
    static func symbol(_ code: Double?) -> String {
        guard let code else { return "cloud.sun.fill" }
        switch Int(code) {
        case 0: return "sun.max.fill"
        case 1, 2: return "cloud.sun.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...57: return "cloud.drizzle.fill"
        case 65, 67, 82: return "cloud.heavyrain.fill"
        case 61...67, 80...82: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.sun.fill"
        }
    }

    static func description(_ code: Double?) -> String? {
        guard let code else { return nil }
        let text: String
        switch Int(code) {
        case 0: text = "jasno"
        case 1: text = "skoro jasno"
        case 2: text = "polojasno"
        case 3: text = "zataženo"
        case 45, 48: text = "mlha"
        case 51...57: text = "mrholení"
        case 61...67: text = "déšť"
        case 71...77: text = "sněžení"
        case 80...82: text = "přeháňky"
        case 85, 86: text = "sněhové přeháňky"
        case 95...99: text = "bouřky"
        default: return nil
        }
        return L10n.tr(text)
    }

    /// "14°" in the user's units.
    static func degrees(_ celsius: Double?) -> String {
        guard let celsius else { return "–" }
        return Fmt.int(Units.temperature(celsius)) + "°"
    }

    /// "14° / 6°": the day's highest and lowest.
    static func range(_ w: TodaySnapshot.Weather) -> String {
        guard w.min != nil else { return degrees(w.max) }
        return degrees(w.max) + " / " + degrees(w.min)
    }

    /// "18 km/h" or "11 mph".
    static func wind(_ kmh: Double?) -> String {
        guard let kmh else { return "–" }
        return Units.imperial ? Fmt.int(Units.distance(kmh)) + " mph" : Fmt.int(kmh) + " km/h"
    }

    /// "0,4 mm" or "0.02 in".
    static func rain(_ mm: Double?) -> String {
        guard let mm else { return "–" }
        return Units.imperial ? Fmt.decimal(Units.length(mm / 10), digits: 2) + " in" : Fmt.decimal(mm, digits: 1) + " mm"
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return "–" }
        return Fmt.int(value) + " %"
    }

    static func indoor(_ advice: TodaySnapshot.Advice?) -> Bool { advice?.environment == "indoor" }
}

/// Today's card above the key numbers: the athlete's status as its first
/// row, then the place with the location arrow and the day's temperatures
/// and a few hours of the forecast.
struct TodayWeatherCard: View {
    let weather: TodaySnapshot.Weather?
    @State private var open = false

    var body: some View {
        Card {
            // The athlete's status first, always visible (Petr, 2026-10-15: no frame).
            AthleteStatusRow()
            Divider().overlay(Palette.hairline)
            Button { open = true } label: {
                HStack(spacing: 5) {
                    Image(systemName: "location.fill").font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.blue)
                    if let weather {
                        Text(verbatim: (weather.place ?? L10n.tr("Počasí")) + " · " + WeatherText.range(weather))
                            .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    } else {
                        Text("Nastavit polohu pro počasí").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let hours = weather?.hours, !hours.isEmpty {
                Button { open = true } label: {
                    HStack(spacing: 0) {
                        ForEach(hours, id: \.hour) { h in
                            VStack(spacing: 5) {
                                Text(verbatim: String(h.hour)).font(Typo.tiny).foregroundStyle(Palette.faint)
                                Image(systemName: WeatherText.symbol(h.code)).font(.system(size: 15)).foregroundStyle(Palette.blue)
                                    .symbolRenderingMode(.hierarchical).frame(height: 18)
                                Text(verbatim: WeatherText.degrees(h.temp)).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $open) { WeatherSheet(weather: weather) }
        .accessibilityElement(children: .contain)
    }
}

/// The weather's sheet: today's forecast and where to train, or the choice
/// of the place when none is set.
struct WeatherSheet: View {
    let weather: TodaySnapshot.Weather?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let weather {
                    WeatherDetails(weather: weather, close: { dismiss() })
                } else {
                    WeatherPlaceView(onSave: { dismiss() })
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
    }
}

/// Today's forecast: the temperatures, wind and rain, and whether a ride and
/// a run belong outdoors (the coach's rule, src/adaptive-week.js environmentFor).
struct WeatherDetails: View {
    let weather: TodaySnapshot.Weather
    var close: () -> Void = {}

    var body: some View {
        SettingsPage(title: "Počasí dnes") {
            HStack(spacing: 16) {
                Image(systemName: WeatherText.symbol(weather.code))
                    .symbolRenderingMode(.multicolor)
                    .font(.system(size: 44))
                    .frame(width: 56)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: WeatherText.range(weather)).font(Typo.number(40)).foregroundStyle(Palette.ink)
                    Text(verbatim: [WeatherText.description(weather.code), weather.place].compactMap { $0 }.joined(separator: " · "))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .accessibilityElement(children: .combine)

            if weather.max == nil {
                Text("Předpověď teď není k dispozici. Doporučení vychází jen z ročního období.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                SettingsGroup(title: "Předpověď na dnes") {
                    SettingsRow(icon: SettingsIcon(systemImage: "wind", color: Palette.blue), title: "Vítr", value: WeatherText.wind(weather.wind), chevron: false)
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "drop.fill", color: Palette.blue), title: "Srážky", value: WeatherText.rain(weather.rain), chevron: false)
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "umbrella.fill", color: Palette.indigo), title: "Pravděpodobnost srážek", value: WeatherText.percent(weather.rainProb), chevron: false)
                }
            }

            SettingsGroup(title: "Kde dnes trénovat") {
                advice("bicycle", "Kolo", weather.outdoor)
                SettingsDivider()
                advice("figure.run", "Běh", weather.outdoorRun)
            }

            SettingsGroup {
                NavigationLink { WeatherPlaceView(onSave: close) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "location.fill", color: Palette.green), title: "Poloha pro počasí", value: weather.place)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private func advice(_ symbol: String, _ sport: String, _ advice: TodaySnapshot.Advice?) -> some View {
        let indoor = WeatherText.indoor(advice)
        return SettingsRow(icon: SettingsIcon(systemImage: symbol, color: indoor ? Palette.amberBar : Palette.green),
                           title: sport, subtitle: advice?.reason, value: L10n.tr(indoor ? "uvnitř" : "venku"), chevron: false)
    }
}

/// A place from Open-Meteo's geocoding search.
struct GeoPlace: Decodable, Identifiable, Hashable {
    let name: String
    let latitude: Double
    let longitude: Double
    let admin1: String?
    let country: String?
    var id: String { name + "|" + String(latitude) + "|" + String(longitude) }

    /// "Jihomoravský kraj, Česko".
    var detail: String? {
        let parts = [admin1, country].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    private struct Response: Decodable {
        let results: [GeoPlace]?
    }

    /// Up to 8 places for the name, straight from Open-Meteo (no key needed).
    static func search(_ name: String) async throws -> [GeoPlace] {
        guard var components = URLComponents(string: "https://geocoding-api.open-meteo.com/v1/search") else { return [] }
        components.queryItems = [
            URLQueryItem(name: "name", value: name),
            URLQueryItem(name: "count", value: "8"),
            URLQueryItem(name: "language", value: L10n.isEnglish ? "en" : "cs"),
            URLQueryItem(name: "format", value: "json")
        ]
        guard let url = components.url else { return [] }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(Response.self, from: data).results ?? []
    }
}

/// "Použít polohu iPhonu": one position from the phone, named by Apple's
/// reverse geocoding. Asked only when the user taps it.
@MainActor
enum DeviceLocation {
    private static let manager = CLLocationManager()

    enum Failure: LocalizedError {
        case denied, unavailable
        var errorDescription: String? {
            switch self {
            case .denied: return L10n.tr("Aurin nemá přístup k poloze. Povol ho v Nastavení iPhonu → Soukromí a zabezpečení → Polohové služby → Aurin.")
            case .unavailable: return L10n.tr("Polohu se nepodařilo zjistit. Zkus to znovu venku nebo vyhledej místo.")
            }
        }
    }

    /// "Aktuální poloha" was chosen: the weather follows the iPhone.
    static let followKey = "weather.followDevice"
    private static let checkedKey = "weather.deviceCheckedAt"
    private static let savedKey = "weather.deviceSaved"

    static var following: Bool { UserDefaults.standard.bool(forKey: followKey) }

    /// While following, at most every two hours and only with access already
    /// granted: a move of more than 10 km saves the new place.
    static func refreshIfFollowing(_ model: AppModel) async {
        guard following, !model.demo else { return }
        let status = manager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }
        let last = UserDefaults.standard.double(forKey: checkedKey)
        guard Date().timeIntervalSince1970 - last > 2 * 3600 else { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: checkedKey)
        guard let place = try? await self.place() else { return }
        let saved = UserDefaults.standard.array(forKey: savedKey) as? [Double] ?? []
        if saved.count == 2 {
            let moved = CLLocation(latitude: saved[0], longitude: saved[1]).distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude))
            if moved < 10_000 { return }
        }
        try? await WeatherPlaceStore.save(place, source: "device", model: model)
    }

    static func remember(_ place: GeoPlace?, following follow: Bool) {
        UserDefaults.standard.set(follow, forKey: followKey)
        if let place, follow {
            UserDefaults.standard.set([place.latitude, place.longitude], forKey: savedKey)
        } else {
            UserDefaults.standard.removeObject(forKey: savedKey)
        }
    }

    static func place() async throws -> GeoPlace {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            // The answer comes from the system dialog.
            for _ in 0..<120 where manager.authorizationStatus == .notDetermined {
                try await Task.sleep(for: .milliseconds(500))
            }
        }
        let status = manager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { throw Failure.denied }
        let found: CLLocation? = try await withThrowingTaskGroup(of: CLLocation?.self) { group in
            group.addTask {
                for try await update in CLLocationUpdate.liveUpdates() {
                    if let location = update.location { return location }
                }
                return nil
            }
            group.addTask {
                try await Task.sleep(for: .seconds(15))
                return nil
            }
            let first = try await group.next() ?? nil
            group.cancelAll()
            return first
        }
        guard let location = found else { throw Failure.unavailable }
        let mark = try? await CLGeocoder().reverseGeocodeLocation(location).first
        return GeoPlace(name: mark?.locality ?? mark?.name ?? L10n.tr("Moje poloha"),
                        latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                        admin1: mark?.administrativeArea, country: mark?.country)
    }
}

/// "Poloha pro počasí": the place whose forecast Today shows and the coach
/// plans by. Saved into the usual week plan (GET/POST /app/api/week-plan,
/// prefs.location), every other key of the plan goes back as it came.
struct WeatherPlaceView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// After saving; without it the page closes itself.
    var onSave: (() -> Void)? = nil

    @State private var query = ""
    @State private var results: [GeoPlace] = []
    @State private var searched = ""
    @State private var searching = false
    @State private var saving = false
    @State private var current: String?
    @State private var error: String?
    @State private var locating = false
    @State private var following = DeviceLocation.following

    var body: some View {
        SettingsPage(title: "Poloha pro počasí") {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField("Město nebo obec", text: $query)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                if searching {
                    ProgressView()
                } else if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint) }
                        .accessibilityLabel("Smazat hledání")
                }
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            SettingsGroup {
                Button { Task { await useDevice() } } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "location.fill")
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.onAccent)
                            .frame(width: 32, height: 32).background(Palette.blue, in: Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Aktuální poloha").font(.body.weight(.semibold)).foregroundStyle(Palette.blue)
                            Text(verbatim: following ? (current.map { $0 + " · " } ?? "") + L10n.tr("aktualizuje se samo") : L10n.tr("poloha iPhonu, aktualizuje se sama"))
                                .font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        if locating { ProgressView() } else if following { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.blue) }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(saving || locating)
            }

            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }

            if !results.isEmpty {
                SettingsGroup(title: "Výsledky") {
                    ForEach(Array(results.enumerated()), id: \.element.id) { index, place in
                        if index > 0 { SettingsDivider() }
                        Button { Task { await save(place) } } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "mappin.and.ellipse", color: Palette.green), title: place.name, subtitle: place.detail, chevron: false)
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                    }
                }
            } else if !searching && !searched.isEmpty && searched == query.trimmingCharacters(in: .whitespacesAndNewlines) {
                Text("Nic jsme nenašli. Zkus jiný název.").font(Typo.small).foregroundStyle(Palette.muted)
            }

            if let current {
                SettingsGroup(title: "Teď") {
                    SettingsRow(icon: SettingsIcon(systemImage: "location.fill", color: Palette.blue), title: current, chevron: false)
                    SettingsDivider()
                    Button { Task { await save(nil) } } label: {
                        SettingsRow(title: "Nepoužívat polohu", chevron: false, titleColor: Palette.rust)
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
            }

            if saving {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .task { await loadCurrent() }
        .task(id: query) { await search() }
    }

    // MARK: Data

    private func search() async {
        let name = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else {
            results = []
            searched = ""
            return
        }
        // Wait for the typing to stop; a new letter cancels this search.
        try? await Task.sleep(for: .milliseconds(350))
        if Task.isCancelled { return }
        searching = true
        defer { searching = false }
        do {
            let found = try await GeoPlace.search(name)
            if Task.isCancelled { return }
            results = found
            searched = name
            error = nil
        } catch {
            if Task.isCancelled { return }
            self.error = L10n.tr("Hledání se nepovedlo. Zkontroluj připojení.")
        }
    }

    private func loadCurrent() async {
        if model.demo {
            current = model.today?.weather?.place
            return
        }
        guard let plan = try? await model.api.weekPlan(start: nil) else { return }
        if case .object(let location)? = WeekPlanPrefs.object(plan.prefs)["location"] {
            current = location["name"]?.string
            following = location["source"]?.string == "device"
        } else {
            current = nil
            following = false
        }
        UserDefaults.standard.set(following, forKey: DeviceLocation.followKey)
    }

    private func useDevice() async {
        locating = true
        defer { locating = false }
        do {
            let place = try await DeviceLocation.place()
            await save(place, source: "device")
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Saves the place (nil: none) into the usual week plan and reloads Today.
    private func save(_ place: GeoPlace?, source: String = "search") async {
        guard !model.demo else {
            error = L10n.tr("V ukázce se poloha neukládá.")
            return
        }
        saving = true
        defer { saving = false }
        do {
            try await WeatherPlaceStore.save(place, source: source, model: model)
            current = place?.name
            following = source == "device" && place != nil
            error = nil
            if let onSave { onSave() } else { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Writes the weather's place into the usual week plan, every other key of
/// the plan as it came, and reloads Today.
@MainActor
enum WeatherPlaceStore {
    static func save(_ place: GeoPlace?, source: String, model: AppModel) async throws {
        let plan = try await model.api.weekPlan(start: nil)
        var prefs = WeekPlanPrefs.object(plan.prefs)
        prefs["source"] = nil
        // The starting template's count is not the athlete's own: it stays automatic.
        if case .object(let automatic)? = prefs["automatic"], automatic["weeklyActivities"] == prefs["weeklyActivities"] {
            prefs["weeklyActivities"] = .null
        }
        prefs["automatic"] = nil
        if let place {
            prefs["location"] = .object([
                "name": .string(place.name),
                "latitude": .number(place.latitude),
                "longitude": .number(place.longitude),
                "source": .string(source)
            ])
        } else {
            prefs["location"] = .null
        }
        try await model.api.saveWeekPlan(start: nil, prefs: .object(prefs))
        DeviceLocation.remember(place, following: source == "device")
        await model.refresh()
    }
}
