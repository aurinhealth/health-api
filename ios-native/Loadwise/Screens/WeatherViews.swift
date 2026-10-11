import SwiftUI

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

/// On Today, next to the athlete's status: the forecast at the week plan's
/// place. A tap opens the wind, rain and where to train; without a place it
/// offers to set one.
struct WeatherPill: View {
    let weather: TodaySnapshot.Weather?
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 10) {
                Image(systemName: weather == nil ? "location.fill" : WeatherText.symbol(weather?.code))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(weather == nil ? Palette.muted : Palette.blue)
                    .frame(width: 30, height: 30)
                    .background((weather == nil ? Palette.muted : Palette.blue).opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                if let weather {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(verbatim: WeatherText.range(weather)).font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                        Text(verbatim: weather.place ?? L10n.tr("Počasí")).font(.caption2).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                } else {
                    Text("Nastavit polohu pro počasí").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                }
            }
            .padding(.leading, 6).padding(.trailing, 14).padding(.vertical, 6)
            .background(Palette.card, in: Capsule())
            .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityText)
        .sheet(isPresented: $open) { WeatherSheet(weather: weather) }
    }

    private var accessibilityText: String {
        guard let weather else { return L10n.tr("Nastavit polohu pro počasí") }
        return L10n.f("Počasí: %@, %@", WeatherText.range(weather), weather.place ?? "")
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

            SettingsGroup(title: "Kde dnes trénovat",
                          footer: "Stejné pravidlo používá kouč při plánu týdne: dovnitř při teplotě pod 8 °C na kole (pod 0 °C při běhu), větru od 35 km/h (při běhu od 50 km/h), od 3 mm srážek, pravděpodobnosti deště od 70 % nebo bouřce. Od listopadu do února plánuje kolo raději na trenažéru.") {
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

    var body: some View {
        SettingsPage(title: "Poloha pro počasí") {
            Text("Podle předpovědi pro toto místo kouč doporučí trénink venku nebo uvnitř a Dnes ukáže počasí.")
                .font(Typo.small).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)

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
                SettingsGroup(title: "Teď", footer: "Poloha platí pro obvyklý týden v plánu. Kouč ji použije i pro další týdny.") {
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
        } else {
            current = nil
        }
    }

    /// Saves the place (nil: none) into the usual week plan and reloads Today.
    private func save(_ place: GeoPlace?) async {
        guard !model.demo else {
            error = L10n.tr("V ukázce se poloha neukládá.")
            return
        }
        saving = true
        defer { saving = false }
        do {
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
                    "source": .string("search")
                ])
            } else {
                prefs["location"] = .null
            }
            try await model.api.saveWeekPlan(start: nil, prefs: .object(prefs))
            current = place?.name
            error = nil
            await model.refresh()
            if let onSave { onSave() } else { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
